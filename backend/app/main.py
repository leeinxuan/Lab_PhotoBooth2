from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import os
import base64
import httpx
from dotenv import load_dotenv


class GenerateRequest(BaseModel):
    prompt: str = Field(..., description="文字提示，英文最佳")
    number_of_images: int = Field(1, ge=1, le=4, description="生成圖片數量 (1-4)")
    aspect_ratio: str | None = Field(None, description='如 "1:1", "3:4", "4:3", "9:16", "16:9"')
    sample_image_size: str | None = Field(None, description='Standard/Ultra 可用: "1K" 或 "2K"')
    person_generation: str | None = Field(
        None, description='"dont_allow" | "allow_adult" | "allow_all" (受地區限制)'
    )
    model: str = Field(
        default="imagen-4.0-generate-001",
        description="Imagen 模型，例如 imagen-4.0-generate-001",
    )


class GenerateImage(BaseModel):
    image_base64: str


class GenerateResponse(BaseModel):
    images: list[GenerateImage]


def create_app() -> FastAPI:
    # 載入 .env 方便本地開發
    load_dotenv()
    app = FastAPI(title="PhotoBooth API", version="0.1.0")

    # 允許本地前端
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    async def health():
        return {"status": "ok"}

    @app.post("/api/generate", response_model=GenerateResponse)
    async def generate(req: GenerateRequest):
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="缺少 GEMINI_API_KEY")

        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{req.model}:predict"
        )

        payload: dict = {
            "instances": [{"prompt": req.prompt}],
            "parameters": {
                "sampleCount": req.number_of_images,
            },
        }
        if req.aspect_ratio:
            payload["parameters"]["aspectRatio"] = req.aspect_ratio
        if req.sample_image_size:
            payload["parameters"]["sampleImageSize"] = req.sample_image_size
        if req.person_generation:
            payload["parameters"]["personGeneration"] = req.person_generation

        headers = {
            "x-goog-api-key": api_key,
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=90) as client:
            r = await client.post(url, json=payload, headers=headers)
            if r.status_code != 200:
                try:
                    detail = r.json()
                except Exception:
                    detail = r.text
                raise HTTPException(status_code=r.status_code, detail=detail)

            data = r.json()
            # 遞迴擷取所有可能的 base64 欄位
            def collect_base64_images(obj):
                found: list[str] = []
                if isinstance(obj, dict):
                    for k, v in obj.items():
                        key = str(k).lower()
                        if key in {
                            "imagebytes",
                            "bytesbase64",
                            "image_base64",
                            "imagebytesbase64",
                            "bytesbase64encoded",
                        }:
                            if isinstance(v, bytes):
                                found.append(base64.b64encode(v).decode("utf-8"))
                            elif isinstance(v, str):
                                found.append(v)
                        # 常見巢狀結構: { image: { imageBytes: ... } }
                        if key in {"image", "image_data"} and isinstance(v, (dict, list)):
                            found.extend(collect_base64_images(v))
                        # 一般遞迴
                        if isinstance(v, (dict, list)):
                            found.extend(collect_base64_images(v))
                elif isinstance(obj, list):
                    for item in obj:
                        found.extend(collect_base64_images(item))
                return found

            # 依不同 SDK/REST 的可能外層鍵位嘗試
            candidate_roots = [
                data,
                data.get("predictions") if isinstance(data, dict) else None,
                data.get("generatedImages") if isinstance(data, dict) else None,
                data.get("generated_images") if isinstance(data, dict) else None,
                data.get("response") if isinstance(data, dict) else None,
            ]
            b64_list: list[str] = []
            for root in candidate_roots:
                if root is not None:
                    b64_list.extend(collect_base64_images(root))

            # 去重與清洗
            uniq = []
            seen = set()
            for s in b64_list:
                if not isinstance(s, str):
                    continue
                trimmed = s.strip()
                if len(trimmed) < 128:  # 過短的字串排除（大多非圖片）
                    continue
                if trimmed in seen:
                    continue
                seen.add(trimmed)
                uniq.append(trimmed)

            generated_images = [GenerateImage(image_base64=s) for s in uniq[:4]]

            if not generated_images:
                # 附上回應摘要以利除錯（不包含長字串）
                def summarize(obj, depth=0):
                    if depth > 2:
                        return "…"
                    if isinstance(obj, dict):
                        return {k: summarize(v, depth + 1) for k, v in list(obj.items())[:10]}
                    if isinstance(obj, list):
                        return [summarize(v, depth + 1) for v in obj[:5]]
                    if isinstance(obj, str):
                        return (obj[:200] + "…") if len(obj) > 200 else obj
                    return obj

                raise HTTPException(
                    status_code=502,
                    detail={
                        "message": "未取得任何圖片",
                        "response_preview": summarize(data),
                    },
                )

            return GenerateResponse(images=generated_images)

    @app.post("/api/stylize", response_model=GenerateResponse)
    async def stylize(
        prompt: str = Form(..., description="文字提示，會與風格描述一併使用"),
        number_of_images: int = Form(1),
        aspect_ratio: str | None = Form(None),
        sample_image_size: str | None = Form(None),
        person_generation: str | None = Form(None),
        model: str = Form("imagen-4.0-generate-001"),
        image: UploadFile = File(...),
    ):
        # 讀入上傳圖片
        content = await image.read()
        if not content:
            raise HTTPException(status_code=400, detail="上傳圖片為空")

        # 若設定了 GEMINI_API_KEY，優先使用 Gemini 2.5 Flash Image（多模態編輯）
        gemini_key = os.getenv("GEMINI_API_KEY")
        if gemini_key:
            image_b64 = base64.b64encode(content).decode("utf-8")
            # Gemini 多模態 generateContent：圖片 + 文字
            # 端點: v1beta/models/gemini-2.5-flash-image-preview:generateContent
            url = (
                "https://generativelanguage.googleapis.com/v1beta/models/"
                "gemini-2.5-flash-image-preview:generateContent"
            )
            payload = {
                "contents": [
                    {
                        "role": "user",
                        "parts": [
                            {
                                "inline_data": {
                                    "mime_type": image.content_type or "image/png",
                                    "data": image_b64,
                                }
                            },
                            {"text": prompt},
                        ],
                    }
                ],
                # 請求單一候選；不設定 responseMimeType（僅允許文字/結構化）
                "generationConfig": {
                    "candidateCount": 1
                },
            }
            headers = {
                "x-goog-api-key": gemini_key,
                "Content-Type": "application/json",
            }
            async with httpx.AsyncClient(timeout=120) as client:
                r = await client.post(url, json=payload, headers=headers)
                if r.status_code != 200:
                    # 若 Gemini 端不支援，將進入下方 Stability 回退
                    try:
                        detail = r.json()
                    except Exception:
                        detail = r.text
                    # 特定錯誤才回退；其他錯誤直接拋出
                    msg = str(detail)
                    unsupported = "not supported" in msg.lower() or "unsupported" in msg.lower()
                    if not unsupported:
                        raise HTTPException(status_code=r.status_code, detail=detail)
                    # 否則繼續回退
                else:
                    data = r.json()
                    # 從 candidates -> content -> parts 取回 inline_data（base64）或 image parts
                    def collect_b64_from_gemini(obj):
                        found: list[str] = []
                        if isinstance(obj, dict):
                            for k, v in obj.items():
                                key = str(k)
                                # inline_data 或 inlineData
                                if key in ("inline_data", "inlineData") and isinstance(v, dict):
                                    b64 = v.get("data")
                                    if isinstance(b64, str) and len(b64) > 128:
                                        found.append(b64)
                                if isinstance(v, (dict, list)):
                                    found.extend(collect_b64_from_gemini(v))
                        elif isinstance(obj, list):
                            for it in obj:
                                found.extend(collect_b64_from_gemini(it))
                        return found

                    # 專注從 candidates[].content.parts[] 收集，並備援全域遞迴
                    b64_list = []
                    cands = data.get("candidates") if isinstance(data, dict) else None
                    if isinstance(cands, list):
                        for c in cands:
                            content = c.get("content") if isinstance(c, dict) else None
                            parts = content.get("parts") if isinstance(content, dict) else None
                            if isinstance(parts, list):
                                b64_list.extend(collect_b64_from_gemini(parts))
                    if not b64_list:
                        b64_list = collect_b64_from_gemini(data)
                    if not b64_list:
                        # 有些情況圖片可能以其他欄位返回，提供預覽協助除錯
                        raise HTTPException(status_code=502, detail={
                            "message": "未取得任何圖片 (Gemini)",
                            "response_preview": {k: type(v).__name__ for k, v in data.items()} if isinstance(data, dict) else str(type(data)),
                        })
                    return GenerateResponse(images=[GenerateImage(image_base64=b64_list[0])])

        # 其餘情況：若設定了 Stability API 金鑰，回退使用以圖生圖
        stability_key = os.getenv("STABILITY_API_KEY")
        if stability_key:
            # 使用 Stability SDXL image-to-image
            # 端點: https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/image-to-image
            # 回應 (application/json): { artifacts: [{ base64: "..." }, ...] }
            form_data = {
                "text_prompts[0][text]": prompt,
                "samples": str(min(max(number_of_images, 1), 4)),
                # 影響輸入影像保留程度: 0~1，越高越接近輸入
                "strength": "0.6",
                # CFG scale 合理值 5~12
                "cfg_scale": "7",
                "steps": "30",
            }
            headers = {
                "Authorization": f"Bearer {stability_key}",
                "Accept": "application/json",
            }
            files = {"init_image": (image.filename or "image.png", content)}
            async with httpx.AsyncClient(timeout=120) as client:
                r = await client.post(
                    "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/image-to-image",
                    data=form_data,
                    files=files,
                    headers=headers,
                )
                if r.status_code != 200:
                    raise HTTPException(status_code=r.status_code, detail=r.text)
                data = r.json()
                artifacts = data.get("artifacts") or []
                b64_list = [a.get("base64") for a in artifacts if isinstance(a, dict) and a.get("base64")]

                if not b64_list:
                    raise HTTPException(status_code=502, detail={
                        "message": "未取得任何圖片 (Stability)",
                        "response_preview": {"keys": list(data.keys()) if isinstance(data, dict) else str(type(data))},
                    })

                return GenerateResponse(images=[GenerateImage(image_base64=b) for b in b64_list[:4]])

        # 否則嘗試 Gemini（注意：Imagen 多數變體不支援圖片條件）
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=400, detail="模型不支援以圖生圖，且未提供 STABILITY_API_KEY 或 GEMINI_API_KEY")

        image_b64 = base64.b64encode(content).decode("utf-8")
        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model}:predict"
        )

        payload: dict = {
            "instances": [
                {
                    "prompt": prompt,
                    "image": {"bytesBase64Encoded": image_b64},
                }
            ],
            "parameters": {
                "sampleCount": number_of_images,
            },
        }
        if aspect_ratio:
            payload["parameters"]["aspectRatio"] = aspect_ratio
        if sample_image_size:
            payload["parameters"]["sampleImageSize"] = sample_image_size
        if person_generation:
            payload["parameters"]["personGeneration"] = person_generation

        headers = {
            "x-goog-api-key": api_key,
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=90) as client:
            r = await client.post(url, json=payload, headers=headers)
            if r.status_code != 200:
                try:
                    detail = r.json()
                except Exception:
                    detail = r.text
                raise HTTPException(status_code=r.status_code, detail=detail)

            data = r.json()

            # 沿用上方解析邏輯
            def collect_base64_images(obj):
                found: list[str] = []
                if isinstance(obj, dict):
                    for k, v in obj.items():
                        key = str(k).lower()
                        if key in {
                            "imagebytes",
                            "bytesbase64",
                            "image_base64",
                            "imagebytesbase64",
                            "bytesbase64encoded",
                        }:
                            if isinstance(v, bytes):
                                found.append(base64.b64encode(v).decode("utf-8"))
                            elif isinstance(v, str):
                                found.append(v)
                        if key in {"image", "image_data"} and isinstance(v, (dict, list)):
                            found.extend(collect_base64_images(v))
                        if isinstance(v, (dict, list)):
                            found.extend(collect_base64_images(v))
                elif isinstance(obj, list):
                    for item in obj:
                        found.extend(collect_base64_images(item))
                return found

            candidate_roots = [
                data,
                data.get("predictions") if isinstance(data, dict) else None,
                data.get("generatedImages") if isinstance(data, dict) else None,
                data.get("generated_images") if isinstance(data, dict) else None,
                data.get("response") if isinstance(data, dict) else None,
            ]
            b64_list: list[str] = []
            for root in candidate_roots:
                if root is not None:
                    b64_list.extend(collect_base64_images(root))

        
            uniq = []
            seen = set()
            for s in b64_list:
                if not isinstance(s, str):
                    continue
                trimmed = s.strip()
                if len(trimmed) < 128:
                    continue
                if trimmed in seen:
                    continue
                seen.add(trimmed)
                uniq.append(trimmed)

            generated_images = [GenerateImage(image_base64=s) for s in uniq[:4]]

            if not generated_images:
                def summarize(obj, depth=0):
                    if depth > 2:
                        return "…"
                    if isinstance(obj, dict):
                        return {k: summarize(v, depth + 1) for k, v in list(obj.items())[:10]}
                    if isinstance(obj, list):
                        return [summarize(v, depth + 1) for v in obj[:5]]
                    if isinstance(obj, str):
                        return (obj[:200] + "…") if len(obj) > 200 else obj
                    return obj

                raise HTTPException(
                    status_code=502,
                    detail={
                        "message": "未取得任何圖片",
                        "response_preview": summarize(data),
                    },
                )

            return GenerateResponse(images=generated_images)

    return app


app = create_app()


