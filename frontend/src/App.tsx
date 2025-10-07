import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import "./App.css";

// 基本型別
type ImageItem = { image_base64: string };
type GenerateResponse = { images: ImageItem[] };

// 背景相框風格（大膽視覺的背景圖）
const BG_STYLES: Record<string, string> = {
  清新日系:
    "hyper minimal poster background, airy white space, soft pastel gradients (peach, mint, sky blue), floating geometric shapes, subtle paper texture, high-key light, editorial layout, photo booth poster, 3:4, ultra clean design, award-winning graphic design, art school studio vibe",
  復古菲林:
    "bold retro film poster background, warm Kodak tones, halftone dots, misregistered CMYK print, chunky typography blocks, grainy paper, 90s Japanese magazine layout, orange and teal accents, 3:4, graphic composition with asymmetry, daring vintage aesthetic",
  韓系膠片:
    "modern Korean editorial poster background, muted pastel palette (sage, beige, dusty pink), clean grid, rounded shapes, soft vignette, risograph-like ink texture, minimalist but playful, negative space hero, 3:4 layout, sophisticated art direction",
  黑白經典:
    "high-contrast black and white poster background, bold Bauhaus layout, giant stripe patterns, checkerboard fragments, thick white borders, stark typographic panels, dramatic light and shadow, gallery exhibition poster aesthetic, 3:4, museum-level design",
};

// 照片（人像）風格（參考附圖）
const PHOTO_STYLES: Record<string, string> = {
  皮克斯風格:
    "Transform the photo into Pixar 3D animation style, smooth rounded features, vibrant colors, soft lighting, cartoon-like proportions while preserving facial features, Disney Pixar character aesthetic, high-quality 3D rendering",
  史努比風格:
    "Transform the photo into Peanuts comic style by Charles M. Schulz, simple black line art, minimal shading, classic comic strip aesthetic, preserve facial features in Schulz's distinctive style",
  Q版公仔風格:
    "Transform into super-deformed chibi figure style, big head small body ratio 1:2, glossy vinyl toy surface, soft studio lighting, cute proportions, smooth skin, tiny hands, gentle reflections, high detail but clean shapes, preserve likeness, kawaii aesthetic",
  動漫手繪風:
    "Transform into Studio Ghibli hand-drawn animation style, soft watercolor-like textures, gentle shading, warm color palette, Miyazaki film aesthetic, preserve facial features in Ghibli's distinctive artistic style, high-quality anime illustration",
};

// 拼貼列印尺寸（像素）
const COLLAGE_WIDTH = 1200; // 4:6 比例可列印
const COLLAGE_HEIGHT = 1600;

function App() {
  // UI 階段：home -> camera -> compose -> edit
  const [step, setStep] = useState<"home" | "camera" | "compose" | "edit">(
    "home"
  );

  // 單張風格化的結果（若無則使用原圖）
  const [styledUrls, setStyledUrls] = useState<(string | null)[]>([
    null,
    null,
    null,
    null,
  ]);

  // 合成後的 dataURL（透明底 2x2）
  const [collageDataUrl, setCollageDataUrl] = useState<string | null>(null);

  // 風格化處理結果（最終輸出）
  const [stylizedUrl, setStylizedUrl] = useState<string | null>(null);

  // 其餘控制
  const [loadingStyleKey, setLoadingStyleKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 風格選擇（背景/照片 分離）
  const [bgKey, setBgKey] = useState<keyof typeof BG_STYLES | null>("清新日系");
  const [photoKey, setPhotoKey] = useState<keyof typeof PHOTO_STYLES | null>(
    null
  );

  // 自定義文字
  const [customText, setCustomText] = useState<string>("SNAPP!");

  // 攝像頭相關狀態
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState<number>(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [capturedPhotos, setCapturedPhotos] = useState<(string | null)[]>([
    null,
    null,
    null,
    null,
  ]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const canCompose = useMemo(
    () => capturedPhotos.filter(Boolean).length === 4,
    [capturedPhotos]
  );

  // 即時預覽更新函數
  const updatePreviewWithCustomText = useCallback(async () => {
    if (!collageDataUrl && !stylizedUrl) return;

    const sourceUrl = stylizedUrl || collageDataUrl;
    if (!sourceUrl) return;

    const canvas = document.createElement("canvas");
    canvas.width = COLLAGE_WIDTH;
    canvas.height = COLLAGE_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 載入現有圖片
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("load image failed"));
      img.src = sourceUrl;
    });

    // 繪製圖片
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // 清除原有文字區域（底部120px）
    ctx.fillStyle = stylizedUrl ? "#ffffff" : "#ffffff";
    ctx.fillRect(0, canvas.height - 120, canvas.width, 120);

    // 重新繪製背景（如果需要）
    if (stylizedUrl && bgKey) {
      // 這裡可以重新繪製背景，但為簡化直接使用現有圖片
    }

    // 繪製新的自定義文字
    ctx.fillStyle = "#111";
    ctx.font = "bold 48px sans-serif";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 10;
    ctx.fillText(customText, canvas.width / 2, canvas.height - 48);
    ctx.shadowBlur = 0;

    const newDataUrl = canvas.toDataURL("image/png");
    if (stylizedUrl) {
      setStylizedUrl(newDataUrl);
    } else {
      setCollageDataUrl(newDataUrl);
    }
  }, [collageDataUrl, stylizedUrl, customText, bgKey]);

  // 監聽文字變化，即時更新預覽
  useEffect(() => {
    if (customText !== "SNAPP!" && (collageDataUrl || stylizedUrl)) {
      const timeoutId = setTimeout(() => {
        updatePreviewWithCustomText();
      }, 300); // 防抖動，避免過於頻繁的更新

      return () => clearTimeout(timeoutId);
    }
  }, [customText, updatePreviewWithCustomText, collageDataUrl, stylizedUrl]);

  // 攝像頭相關功能
  const startCamera = useCallback(async () => {
    try {
      setError(null);
      console.log("正在請求攝像頭權限...");

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user", // 使用前置攝像頭
        },
      });

      console.log("攝像頭權限已獲取，視頻流:", mediaStream);
      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        console.log("視頻元素已設置");

        // 確保視頻開始播放
        videoRef.current.onloadedmetadata = () => {
          console.log("視頻元數據已加載");
          if (videoRef.current) {
            videoRef.current
              .play()
              .then(() => {
                console.log("視頻開始播放");
              })
              .catch(console.error);
          }
        };

        // 直接嘗試播放
        videoRef.current
          .play()
          .then(() => {
            console.log("視頻直接播放成功");
          })
          .catch((err) => {
            console.log("直接播放失敗，等待元數據加載:", err);
          });
      }
    } catch (err: any) {
      console.error("攝像頭啟動失敗:", err);
      let errorMessage = "無法訪問攝像頭";

      if (err.name === "NotAllowedError") {
        errorMessage = "攝像頭權限被拒絕，請允許瀏覽器訪問攝像頭";
      } else if (err.name === "NotFoundError") {
        errorMessage = "找不到攝像頭設備";
      } else if (err.name === "NotReadableError") {
        errorMessage = "攝像頭正被其他應用程式使用";
      }

      setError(errorMessage);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  }, [stream]);

  // startCountdown 會在下方定義，確保不觸發 no-use-before-define

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !captureCanvasRef.current) return;

    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    const dataURL = canvas.toDataURL("image/png");

    setCapturedPhotos((prev) => {
      const newPhotos = [...prev];
      newPhotos[currentPhotoIndex] = dataURL;
      return newPhotos;
    });

    setIsCapturing(false);
    setCountdown(null);
  }, [currentPhotoIndex]);

  const startCountdown = useCallback(() => {
    setCountdown(5);
    setIsCapturing(true);

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          capturePhoto();
          return null;
        }
        return (prev as number) - 1;
      });
    }, 1000);
  }, [capturePhoto]);

  // 當索引變更且該張尚未拍攝時，自動開始倒數一次
  useEffect(() => {
    if (!stream) return;
    if (
      !capturedPhotos[currentPhotoIndex] &&
      countdown === null &&
      !isCapturing
    ) {
      // 稍作延遲，確保畫面穩定
      const t = setTimeout(() => startCountdown(), 300);
      return () => clearTimeout(t);
    }
  }, [
    currentPhotoIndex,
    capturedPhotos,
    countdown,
    isCapturing,
    startCountdown,
    stream,
  ]);

  const retakePhoto = useCallback(() => {
    setCapturedPhotos((prev) => {
      const newPhotos = [...prev];
      newPhotos[currentPhotoIndex] = null;
      return newPhotos;
    });
    // 重置對應的風格化結果
    setStyledUrls((prev) => {
      const newStyled = [...prev];
      newStyled[currentPhotoIndex] = null;
      return newStyled;
    });
    // 確保攝像頭正在運行，然後開始倒數
    if (!stream) {
      startCamera().then(() => {
        setTimeout(() => startCountdown(), 500);
      });
    } else {
      // 如果攝像頭已經在運行，直接開始倒數
      setTimeout(() => startCountdown(), 100);
    }
  }, [currentPhotoIndex, stream, startCamera, startCountdown]);

  const nextPhoto = useCallback(() => {
    if (currentPhotoIndex < 3) {
      setCurrentPhotoIndex((prev) => prev + 1);
    } else {
      // 四張照片都拍完了，停止攝像頭並轉到合成步驟
      stopCamera();
      setStep("compose");
    }
  }, [currentPhotoIndex, stopCamera]);

  // 清理攝像頭資源
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // 當stream設置後，確保視頻播放
  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(console.error);
    }
  }, [stream]);

  // 單張風格化工具
  const stylizeSingle = useCallback(
    async (idx: number) => {
      const photoDataUrl = capturedPhotos[idx];
      if (!photoDataUrl || !photoKey) return; // 無照片或未選照片風格則跳過

      // 將dataURL轉換為File
      const response = await fetch(photoDataUrl);
      const blob = await response.blob();
      const f = new File([blob], `photo_${idx}.png`, { type: "image/png" });
      try {
        const form = new FormData();
        form.append("prompt", PHOTO_STYLES[photoKey]);
        form.append("number_of_images", "1");
        form.append("model", "imagen-4.0-generate-001");
        form.append("image", f);
        let data: GenerateResponse;
        try {
          const r = await axios.post<GenerateResponse>("/api/stylize", form, {
            headers: { "Content-Type": "multipart/form-data" },
          });
          data = r.data;
        } catch {
          // 後備：純文字
          const r2 = await axios.post<GenerateResponse>("/api/generate", {
            prompt: PHOTO_STYLES[photoKey],
            number_of_images: 1,
          });
          data = r2.data;
        }
        const b64 = data.images?.[0]?.image_base64;
        if (!b64) throw new Error("未取得單張風格結果");
        const dataUrl = `data:image/png;base64,${b64}`;
        setStyledUrls((prev) => {
          const c = [...prev];
          c[idx] = dataUrl;
          return c;
        });
      } catch (e: any) {
        setError(e?.message || `第 ${idx + 1} 張處理失敗`);
      }
    },
    [capturedPhotos, photoKey]
  );

  // 變更照片風格時，對現有照片全部重跑
  useEffect(() => {
    if (!photoKey) return;
    capturedPhotos.forEach((photo, idx) => {
      if (photo) stylizeSingle(idx);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoKey]);

  // 合成 2x2（每格固定 3:4）
  const composeCollage = useCallback(async () => {
    if (!canCompose) return;
    setError(null);
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = COLLAGE_WIDTH;
    canvas.height = COLLAGE_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const cols = 2;
    const rows = 2;
    const gap = 20;
    const bottomSpace = 100;

    const cellAspectW = 1;
    const cellAspectH = 1;
    const targetRatio = cellAspectW / cellAspectH;

    // 計算可用空間（扣除底部文字空間）
    const availableW = canvas.width;
    const availableH = canvas.height - bottomSpace;

    // 計算格子尺寸 - 確保正方形
    const availableWidthForGrid = availableW - gap;
    const availableHeightForGrid = availableH - gap;

    // 計算每個格子的最大可能尺寸
    const maxCellW = availableWidthForGrid / cols;
    const maxCellH = availableHeightForGrid / rows;

    // 使用較小的尺寸確保格子是正方形且不超出邊界
    const cellSize = Math.min(maxCellW, maxCellH);
    const cellW = cellSize;
    const cellH = cellSize;

    // 計算總使用空間
    const totalW = cols * cellW + (cols - 1) * gap;
    const totalH = rows * cellH + (rows - 1) * gap;

    // 計算置中起始位置
    const startX = (canvas.width - totalW) / 2;
    const startY = (availableH - totalH) / 2;

    // 來源：優先使用風格化結果，否則拍攝的照片
    const sourceUrls = styledUrls.map((s, i) => s || capturedPhotos[i]);

    const loaded: HTMLImageElement[] = [];
    for (const url of sourceUrls) {
      const u = url as string;
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error("load image failed"));
        img.src = u;
      });
      loaded.push(img);
    }

    loaded.forEach((img, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const x = startX + c * (cellW + gap);
      const y = startY + r * (cellH + gap);

      // 使用 cover 模式，確保圖片填滿正方形格子並保持比例
      const imgRatio = img.width / img.height;
      const cellRatio = 1; // 正方形格子

      let sourceX = 0;
      let sourceY = 0;
      let sourceW = img.width;
      let sourceH = img.height;

      if (imgRatio > cellRatio) {
        // 圖片比格子寬，裁切左右
        sourceW = img.height * cellRatio;
        sourceX = (img.width - sourceW) / 2;
      } else {
        // 圖片比格子高，裁切上下
        sourceH = img.width / cellRatio;
        sourceY = (img.height - sourceH) / 2;
      }

      const rad = 16;
      const path = new Path2D();
      path.moveTo(x + rad, y);
      path.lineTo(x + cellW - rad, y);
      path.quadraticCurveTo(x + cellW, y, x + cellW, y + rad);
      path.lineTo(x + cellW, y + cellH - rad);
      path.quadraticCurveTo(x + cellW, y + cellH, x + cellW - rad, y + cellH);
      path.lineTo(x + rad, y + cellH);
      path.quadraticCurveTo(x, y + cellH, x, y + cellH - rad);
      path.lineTo(x, y + rad);
      path.quadraticCurveTo(x, y, x + rad, y);

      // 陰影
      const shadowSpread = 12;
      (ctx as any).shadowColor = "rgba(0,0,0,0.18)";
      (ctx as any).shadowBlur = shadowSpread;
      (ctx as any).shadowOffsetY = 6;
      ctx.fillStyle = "rgba(255,255,255,0.001)";
      ctx.fill(path);
      (ctx as any).shadowBlur = 0;

      ctx.save();
      ctx.clip(path);
      ctx.drawImage(
        img,
        sourceX,
        sourceY,
        sourceW,
        sourceH,
        x,
        y,
        cellW,
        cellH
      );
      ctx.restore();
    });

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 48px sans-serif";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 10;
    ctx.fillText(customText, canvas.width / 2, canvas.height - 48);
    ctx.shadowBlur = 0;

    const dataUrl = canvas.toDataURL("image/png");
    setCollageDataUrl(dataUrl);
    setStylizedUrl(null);
    setStep("edit");
  }, [canCompose, capturedPhotos, styledUrls]);

  const downloadImage = useCallback(() => {
    const url = stylizedUrl || collageDataUrl;
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = "photobooth.png";
    a.click();
  }, [stylizedUrl, collageDataUrl]);

  // 獨立轉換背景風格
  const convertBackgroundStyle = useCallback(async () => {
    if (!bgKey) return;
    setError(null);
    const currentKey = `背景風格轉換: ${bgKey}`;
    setLoadingStyleKey(currentKey);

    try {
      // 生成新背景
      const gen = await axios.post<GenerateResponse>("/api/generate", {
        prompt: BG_STYLES[bgKey],
        number_of_images: 1,
        aspect_ratio: "3:4",
        sample_image_size: "2K",
      });
      const bgB64 = gen.data.images?.[0]?.image_base64;
      if (!bgB64) throw new Error("未取得背景圖");
      const bgUrl = `data:image/png;base64,${bgB64}`;

      // 重新合成（使用現有照片，只更換背景）
      const canvas = document.createElement("canvas");
      canvas.width = COLLAGE_WIDTH;
      canvas.height = COLLAGE_HEIGHT;
      const ctx = canvas.getContext("2d")!;

      // 白底
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 新背景
      const bg = await new Promise<HTMLImageElement>((res, rej) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => res(img);
        img.onerror = () => rej(new Error("bg load fail"));
        img.src = bgUrl;
      });
      const bgRatio = bg.width / bg.height;
      const cvRatio = canvas.width / canvas.height;
      let bgW = canvas.width;
      let bgH = canvas.height;
      if (bgRatio > cvRatio) {
        bgH = canvas.height;
        bgW = bgH * bgRatio;
      } else {
        bgW = canvas.width;
        bgH = bgW / bgRatio;
      }
      ctx.drawImage(
        bg,
        (canvas.width - bgW) / 2,
        (canvas.height - bgH) / 2,
        bgW,
        bgH
      );

      // 使用現有的照片（優先使用風格化結果，否則使用原圖）
      const sourceUrls = styledUrls.map((s, i) => s || capturedPhotos[i]);
      const imgs: HTMLImageElement[] = [];
      for (const u of sourceUrls) {
        if (u) {
          const img = await new Promise<HTMLImageElement>((res, rej) => {
            const im = new Image();
            im.crossOrigin = "anonymous";
            im.onload = () => res(im);
            im.onerror = () => rej(new Error("img load fail"));
            im.src = u;
          });
          imgs.push(img);
        }
      }

      // 2x2 佈局
      const margin = 60;
      const cols = 2;
      const rows = 2;
      const gap = 20;
      const bottomSpace = 100;
      const targetRatio = 1; // 正方形
      const availableW = canvas.width - margin * 2 - (cols - 1) * gap;
      const availableH =
        canvas.height - margin * 2 - (rows - 1) * gap - bottomSpace;
      let cellW = availableW / cols;
      let cellH = cellW / targetRatio;
      const totalHNeeded = rows * cellH + (rows - 1) * gap;
      if (totalHNeeded > availableH) {
        cellH = availableH / rows;
        cellW = cellH * targetRatio;
      }
      const usedH = rows * cellH + (rows - 1) * gap;
      const startY = margin + (availableH - usedH) / 2;

      imgs.forEach((img, i) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const x = margin + c * (cellW + gap);
        const y = startY + r * (cellH + gap);

        // 使用 cover 模式，確保圖片填滿正方形格子並保持比例
        const imgRatio = img.width / img.height;
        const cellRatio = 1; // 正方形格子

        let sourceX = 0;
        let sourceY = 0;
        let sourceW = img.width;
        let sourceH = img.height;

        if (imgRatio > cellRatio) {
          // 圖片比格子寬，裁切左右
          sourceW = img.height * cellRatio;
          sourceX = (img.width - sourceW) / 2;
        } else {
          // 圖片比格子高，裁切上下
          sourceH = img.width / cellRatio;
          sourceY = (img.height - sourceH) / 2;
        }

        const rad = 16;
        const path = new Path2D();
        path.moveTo(x + rad, y);
        path.lineTo(x + cellW - rad, y);
        path.quadraticCurveTo(x + cellW, y, x + cellW, y + rad);
        path.lineTo(x + cellW, y + cellH - rad);
        path.quadraticCurveTo(x + cellW, y + cellH, x + cellW - rad, y + cellH);
        path.lineTo(x + rad, y + cellH);
        path.quadraticCurveTo(x, y + cellH, x, y + cellH - rad);
        path.lineTo(x, y + rad);
        path.quadraticCurveTo(x, y, x + rad, y);

        // 陰影
        const shadowSpread = 12;
        (ctx as any).shadowColor = "rgba(0,0,0,0.18)";
        (ctx as any).shadowBlur = shadowSpread;
        (ctx as any).shadowOffsetY = 6;
        ctx.fillStyle = "rgba(255,255,255,0.001)";
        ctx.fill(path);
        (ctx as any).shadowBlur = 0;

        ctx.save();
        ctx.clip(path);
        ctx.drawImage(
          img,
          sourceX,
          sourceY,
          sourceW,
          sourceH,
          x,
          y,
          cellW,
          cellH
        );
        ctx.restore();
      });

      // 下方標題
      ctx.fillStyle = "#111";
      ctx.font = "bold 48px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(customText, canvas.width / 2, canvas.height - 48);

      const out = canvas.toDataURL("image/png");
      setStylizedUrl(out);
    } catch (err: any) {
      setError(err?.message || "背景風格轉換失敗");
    } finally {
      setLoadingStyleKey(null);
    }
  }, [bgKey, styledUrls, capturedPhotos]);

  // 獨立轉換照片風格
  const convertPhotoStyle = useCallback(async () => {
    if (!photoKey) return;
    setError(null);
    const currentKey = `照片風格轉換: ${photoKey}`;
    setLoadingStyleKey(currentKey);

    try {
      // 對四張照片逐一風格化
      const perImageUrls: string[] = [];
      for (let i = 0; i < 4; i++) {
        const photoDataUrl = capturedPhotos[i];
        if (!photoDataUrl) throw new Error(`缺少第 ${i + 1} 張來源`);

        const response = await fetch(photoDataUrl);
        const blob = await response.blob();
        const file = new File([blob], `img${i + 1}.png`, {
          type: blob.type || "image/png",
        });

        const form = new FormData();
        form.append("prompt", PHOTO_STYLES[photoKey]);
        form.append("number_of_images", "1");
        form.append("model", "imagen-4.0-generate-001");
        form.append("image", file);

        let data: GenerateResponse;
        try {
          const r = await axios.post<GenerateResponse>("/api/stylize", form, {
            headers: { "Content-Type": "multipart/form-data" },
          });
          data = r.data;
        } catch {
          const r2 = await axios.post<GenerateResponse>("/api/generate", {
            prompt: PHOTO_STYLES[photoKey],
            number_of_images: 1,
          });
          data = r2.data;
        }
        const b64 = data.images?.[0]?.image_base64;
        if (!b64) throw new Error(`第 ${i + 1} 張風格化失敗`);
        perImageUrls.push(`data:image/png;base64,${b64}`);
      }

      // 重新合成（使用現有背景，只更換照片）
      const canvas = document.createElement("canvas");
      canvas.width = COLLAGE_WIDTH;
      canvas.height = COLLAGE_HEIGHT;
      const ctx = canvas.getContext("2d")!;

      // 白底
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 現有背景（如果有的話）
      if (stylizedUrl) {
        const bg = await new Promise<HTMLImageElement>((res, rej) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => res(img);
          img.onerror = () => rej(new Error("bg load fail"));
          img.src = stylizedUrl!;
        });
        ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
      }

      // 2x2 佈局
      const margin = 60;
      const cols = 2;
      const rows = 2;
      const gap = 20;
      const bottomSpace = 100;
      const targetRatio = 1; // 正方形
      const availableW = canvas.width - margin * 2 - (cols - 1) * gap;
      const availableH =
        canvas.height - margin * 2 - (rows - 1) * gap - bottomSpace;
      let cellW = availableW / cols;
      let cellH = cellW / targetRatio;
      const totalHNeeded = rows * cellH + (rows - 1) * gap;
      if (totalHNeeded > availableH) {
        cellH = availableH / rows;
        cellW = cellH * targetRatio;
      }
      const usedH = rows * cellH + (rows - 1) * gap;
      const startY = margin + (availableH - usedH) / 2;

      // 載入四張風格化照片
      const imgs: HTMLImageElement[] = [];
      for (const u of perImageUrls) {
        const img = await new Promise<HTMLImageElement>((res, rej) => {
          const im = new Image();
          im.crossOrigin = "anonymous";
          im.onload = () => res(im);
          im.onerror = () => rej(new Error("img load fail"));
          im.src = u;
        });
        imgs.push(img);
      }

      imgs.forEach((img, i) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const x = margin + c * (cellW + gap);
        const y = startY + r * (cellH + gap);

        // 使用 cover 模式，確保圖片填滿正方形格子並保持比例
        const imgRatio = img.width / img.height;
        const cellRatio = 1; // 正方形格子

        let sourceX = 0;
        let sourceY = 0;
        let sourceW = img.width;
        let sourceH = img.height;

        if (imgRatio > cellRatio) {
          // 圖片比格子寬，裁切左右
          sourceW = img.height * cellRatio;
          sourceX = (img.width - sourceW) / 2;
        } else {
          // 圖片比格子高，裁切上下
          sourceH = img.width / cellRatio;
          sourceY = (img.height - sourceH) / 2;
        }

        const rad = 16;
        const path = new Path2D();
        path.moveTo(x + rad, y);
        path.lineTo(x + cellW - rad, y);
        path.quadraticCurveTo(x + cellW, y, x + cellW, y + rad);
        path.lineTo(x + cellW, y + cellH - rad);
        path.quadraticCurveTo(x + cellW, y + cellH, x + cellW - rad, y + cellH);
        path.lineTo(x + rad, y + cellH);
        path.quadraticCurveTo(x, y + cellH, x, y + cellH - rad);
        path.lineTo(x, y + rad);
        path.quadraticCurveTo(x, y, x + rad, y);

        // 陰影
        const shadowSpread = 12;
        (ctx as any).shadowColor = "rgba(0,0,0,0.18)";
        (ctx as any).shadowBlur = shadowSpread;
        (ctx as any).shadowOffsetY = 6;
        ctx.fillStyle = "rgba(255,255,255,0.001)";
        ctx.fill(path);
        (ctx as any).shadowBlur = 0;

        ctx.save();
        ctx.clip(path);
        ctx.drawImage(
          img,
          sourceX,
          sourceY,
          sourceW,
          sourceH,
          x,
          y,
          cellW,
          cellH
        );
        ctx.restore();
      });

      // 下方標題
      ctx.fillStyle = "#111";
      ctx.font = "bold 48px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(customText, canvas.width / 2, canvas.height - 48);

      const out = canvas.toDataURL("image/png");
      setStylizedUrl(out);
    } catch (err: any) {
      setError(err?.message || "照片風格轉換失敗");
    } finally {
      setLoadingStyleKey(null);
    }
  }, [photoKey, capturedPhotos, stylizedUrl]);

  // 生成背景，最後合成（在此階段統一對四張照片做風格化）
  const runStyling = useCallback(async () => {
    if (capturedPhotos.filter(Boolean).length !== 4) return;
    const currentKey = `${bgKey || "無背景"}|${
      photoKey || "原圖"
    } 最終統一處理`;
    setLoadingStyleKey(currentKey);
    setError(null);
    try {
      // 1) 先準備四張來源（從拍攝的照片取得 Blob）
      const blobs: (Blob | null)[] = [];
      for (let i = 0; i < 4; i++) {
        const photoDataUrl = capturedPhotos[i];
        if (photoDataUrl) {
          const r = await fetch(photoDataUrl);
          blobs.push(await r.blob());
        } else {
          blobs.push(null);
        }
      }

      // 2) 若有選擇照片風格，對四張逐一風格化（可平行，但為簡化採順序以減少併發壓力）
      const perImageUrls: string[] = [];
      for (let i = 0; i < 4; i++) {
        const b = blobs[i];
        if (!b) throw new Error(`缺少第 ${i + 1} 張來源`);
        if (photoKey) {
          const file = new File([b], `img${i + 1}.png`, {
            type: b.type || "image/png",
          });
          const form = new FormData();
          form.append("prompt", PHOTO_STYLES[photoKey]);
          form.append("number_of_images", "1");
          form.append("model", "imagen-4.0-generate-001");
          form.append("image", file);
          let data: GenerateResponse;
          try {
            const r = await axios.post<GenerateResponse>("/api/stylize", form, {
              headers: { "Content-Type": "multipart/form-data" },
            });
            data = r.data;
          } catch {
            const r2 = await axios.post<GenerateResponse>("/api/generate", {
              prompt: PHOTO_STYLES[photoKey],
              number_of_images: 1,
            });
            data = r2.data;
          }
          const b64 = data.images?.[0]?.image_base64;
          if (!b64) throw new Error(`第 ${i + 1} 張風格化失敗`);
          perImageUrls.push(`data:image/png;base64,${b64}`);
        } else {
          perImageUrls.push(URL.createObjectURL(b));
        }
      }

      // 3) 背景生成（若有）
      let bgUrl: string | null = null;
      if (bgKey) {
        const gen = await axios.post<GenerateResponse>("/api/generate", {
          prompt: BG_STYLES[bgKey],
          number_of_images: 1,
          aspect_ratio: "3:4",
          sample_image_size: "2K",
        });
        const bgB64 = gen.data.images?.[0]?.image_base64;
        if (!bgB64) throw new Error("未取得背景圖");
        bgUrl = `data:image/png;base64,${bgB64}`;
      }

      // 4) 共同合成（白底 -> 背景 -> 2x2 圖片）
      const canvas = document.createElement("canvas");
      canvas.width = COLLAGE_WIDTH;
      canvas.height = COLLAGE_HEIGHT;
      const ctx = canvas.getContext("2d")!;

      // 白底
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 背景
      if (bgUrl) {
        const bg = await new Promise<HTMLImageElement>((res, rej) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => res(img);
          img.onerror = () => rej(new Error("bg load fail"));
          img.src = bgUrl!;
        });
        const bgRatio = bg.width / bg.height;
        const cvRatio = canvas.width / canvas.height;
        let bgW = canvas.width;
        let bgH = canvas.height;
        if (bgRatio > cvRatio) {
          bgH = canvas.height;
          bgW = bgH * bgRatio;
        } else {
          bgW = canvas.width;
          bgH = bgW / bgRatio;
        }
        ctx.drawImage(
          bg,
          (canvas.width - bgW) / 2,
          (canvas.height - bgH) / 2,
          bgW,
          bgH
        );
      }

      // 2x2 佈局（正方形）
      const margin = 60;
      const cols = 2;
      const rows = 2;
      const gap = 20;
      const bottomSpace = 100;
      const targetRatio = 1; // 正方形
      const availableW = canvas.width - margin * 2 - (cols - 1) * gap;
      const availableH =
        canvas.height - margin * 2 - (rows - 1) * gap - bottomSpace;

      // 計算正方形格子尺寸
      const maxCellW = availableW / cols;
      const maxCellH = availableH / rows;
      const cellSize = Math.min(maxCellW, maxCellH);
      const cellW = cellSize;
      const cellH = cellSize;

      const usedH = rows * cellH + (rows - 1) * gap;
      const startY = margin + (availableH - usedH) / 2;

      // 載入四張
      const imgs: HTMLImageElement[] = [];
      for (const u of perImageUrls) {
        const img = await new Promise<HTMLImageElement>((res, rej) => {
          const im = new Image();
          im.crossOrigin = "anonymous";
          im.onload = () => res(im);
          im.onerror = () => rej(new Error("img load fail"));
          im.src = u;
        });
        imgs.push(img);
      }

      imgs.forEach((img, i) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const x = margin + c * (cellW + gap);
        const y = startY + r * (cellH + gap);

        // 使用 cover 模式，確保圖片填滿正方形格子並保持比例
        const imgRatio = img.width / img.height;
        const cellRatio = 1; // 正方形格子

        let sourceX = 0;
        let sourceY = 0;
        let sourceW = img.width;
        let sourceH = img.height;

        if (imgRatio > cellRatio) {
          // 圖片比格子寬，裁切左右
          sourceW = img.height * cellRatio;
          sourceX = (img.width - sourceW) / 2;
        } else {
          // 圖片比格子高，裁切上下
          sourceH = img.width / cellRatio;
          sourceY = (img.height - sourceH) / 2;
        }

        const rad = 16;
        const path = new Path2D();
        path.moveTo(x + rad, y);
        path.lineTo(x + cellW - rad, y);
        path.quadraticCurveTo(x + cellW, y, x + cellW, y + rad);
        path.lineTo(x + cellW, y + cellH - rad);
        path.quadraticCurveTo(x + cellW, y + cellH, x + cellW - rad, y + cellH);
        path.lineTo(x + rad, y + cellH);
        path.quadraticCurveTo(x, y + cellH, x, y + cellH - rad);
        path.lineTo(x, y + rad);
        path.quadraticCurveTo(x, y, x + rad, y);

        // 陰影
        const shadowSpread = 12;
        (ctx as any).shadowColor = "rgba(0,0,0,0.18)";
        (ctx as any).shadowBlur = shadowSpread;
        (ctx as any).shadowOffsetY = 6;
        ctx.fillStyle = "rgba(255,255,255,0.001)";
        ctx.fill(path);
        (ctx as any).shadowBlur = 0;

        ctx.save();
        ctx.clip(path);
        ctx.drawImage(
          img,
          sourceX,
          sourceY,
          sourceW,
          sourceH,
          x,
          y,
          cellW,
          cellH
        );
        ctx.restore();
      });

      // 下方標題
      ctx.fillStyle = "#111";
      ctx.font = "bold 48px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(customText, canvas.width / 2, canvas.height - 48);

      const out = canvas.toDataURL("image/png");
      setStylizedUrl(out);
    } catch (err: any) {
      setError(err?.message || "風格化失敗");
    } finally {
      setLoadingStyleKey(null);
    }
  }, [capturedPhotos, bgKey, photoKey]);

  // 畫面
  if (step === "home") {
    return (
      <div
        style={{
          height: "100vh",
          width: "100%",
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "3rem",
          boxSizing: "border-box",
          overflow: "hidden",
          position: "fixed",
          top: 0,
          left: 0,
          
        }}
      >
        <div
          style={{
            background: "white",
            borderRadius: "20px",
            padding: "40px",
            maxWidth: "500px",
            width: "100%",
            boxShadow: "0 20px 40px rgba(0,0,0,0.1)",
            textAlign: "center",
          }}
        >
          <h1
            style={{
              fontSize: "2.5rem",
              fontWeight: "bold",
              color: "#2d3748",
              marginBottom: "20px",
              background: "linear-gradient(135deg, #667eea, #764ba2)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            拍貼機
          </h1>

          <p
            style={{
              fontSize: "1.1rem",
              color: "#4a5568",
              lineHeight: "1.6",
              marginBottom: "30px",
            }}
          >
            準備好擺出最棒的姿勢了嗎？點擊下方按鈕，開始創造你的專屬回憶！
          </p>

          <button
            onClick={async () => {
              setStep("camera");
              // 延遲啟動攝像頭，確保頁面已切換
              setTimeout(async () => {
                await startCamera();
                // 攝像頭啟動後立即開始倒數
                setTimeout(() => {
                  startCountdown();
                }, 500);
              }, 100);
            }}
            style={{
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              color: "white",
              border: "none",
              borderRadius: "50px",
              padding: "16px 40px",
              fontSize: "1.2rem",
              fontWeight: "bold",
              cursor: "pointer",
              boxShadow: "0 10px 20px rgba(102, 126, 234, 0.3)",
              transition: "all 0.3s ease",
              width: "100%",
              maxWidth: "300px",
            }}
          >
            開始體驗
          </button>
        </div>
      </div>
    );
  }

  if (step === "camera") {
    return (
      <div
        style={{
          height: "100vh",
          width: "100vw",
          background: "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)",
          padding: "20px",
          boxSizing: "border-box",
          overflow: "hidden",
          position: "fixed",
          top: 0,
          left: 0,
          display: "flex",
          alignItems: "center",
        }}
      >
        <div
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            background: "white",
            borderRadius: "20px",
            padding: "30px",
            boxShadow: "0 20px 40px rgba(0,0,0,0.1)",
          }}
        >
          {/* 移除標題，符合簡潔設計 */}

          <div style={{ display: "flex", gap: 30, height: "70vh" }}>
            {/* 左側：攝像頭預覽和拍攝的照片 */}
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              {/* 攝像頭預覽 */}
              <div
                style={{
                  position: "relative",
                  flex: 1,
                  border: "3px solid #e2e8f0",
                  borderRadius: "20px",
                  overflow: "hidden",
                  background: "#f8fafc",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
                }}
              >
                {!stream && (
                  <div style={{ textAlign: "center", color: "#666" }}>
                    <p>點擊「啟動攝像頭」開始拍攝</p>
                    <button
                      onClick={startCamera}
                      style={{
                        padding: "12px 24px",
                        fontSize: "16px",
                        background: "#007bff",
                        color: "white",
                        border: "none",
                        borderRadius: "8px",
                        cursor: "pointer",
                        marginTop: "12px",
                      }}
                    >
                      啟動攝像頭
                    </button>
                    {error && (
                      <div
                        style={{
                          marginTop: "12px",
                          padding: "8px",
                          background: "#f8d7da",
                          color: "#721c24",
                          borderRadius: "4px",
                          fontSize: "14px",
                        }}
                      >
                        {error}
                      </div>
                    )}
                  </div>
                )}

                {stream && (
                  <>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        backgroundColor: "#000",
                      }}
                      onLoadedMetadata={() => {
                        console.log(
                          "視頻元數據已加載，尺寸:",
                          videoRef.current?.videoWidth,
                          "x",
                          videoRef.current?.videoHeight
                        );
                        // 強制播放
                        if (videoRef.current) {
                          videoRef.current.play().catch(console.error);
                        }
                      }}
                      onCanPlay={() => {
                        console.log("視頻可以播放");
                      }}
                      onError={(e) => {
                        console.error("視頻播放錯誤:", e);
                      }}
                      onPlay={() => {
                        console.log("視頻正在播放");
                      }}
                    />

                    {/* 已拍攝照片覆蓋層 */}
                    {capturedPhotos[currentPhotoIndex] && (
                      <div
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          background: "#f8f9fa",
                          display: "flex",
                          flexDirection: "column",
                          borderRadius: 12,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            padding: "8px 12px",
                            background: "#28a745",
                            color: "white",
                            fontSize: "14px",
                            fontWeight: "bold",
                            textAlign: "center",
                          }}
                        >
                          ✓ 第 {currentPhotoIndex + 1} 張照片已拍攝
                        </div>
                        <img
                          src={capturedPhotos[currentPhotoIndex]!}
                          alt={`captured_${currentPhotoIndex}`}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "contain",
                          }}
                        />
                      </div>
                    )}

                    {/* 倒數計時覆蓋層 */}
                    {countdown !== null &&
                      !capturedPhotos[currentPhotoIndex] && (
                        <div
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: "rgba(0,0,0,0.7)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "120px",
                            fontWeight: "bold",
                            color: "white",
                            textShadow: "0 0 20px rgba(255,255,255,0.8)",
                          }}
                        >
                          {countdown}
                        </div>
                      )}
                  </>
                )}
              </div>
            </div>

            {/* 右側：縮圖/操作區 */}
            <div
              style={{
                width: "320px",
                display: "flex",
                flexDirection: "column",
                gap: 20,
                justifyContent: "center",
                background: "#f8fafc",
                borderRadius: "20px",
                padding: "30px",
                boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
              }}
            >
              {/* 已拍攝縮圖列表（拍攝階段顯示） */}
              {!capturedPhotos[currentPhotoIndex] && (
                <div style={{ display: "grid", gap: 12 }}>
                  {[0, 1, 2, 3]
                    .filter((i) => capturedPhotos[i])
                    .map((i) => (
                      <div
                        key={i}
                        style={{
                          borderRadius: 12,
                          overflow: "hidden",
                          position: "relative",
                          background: "#fff",
                          boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                        }}
                      >
                        <img
                          src={capturedPhotos[i]!}
                          alt={`thumb_${i}`}
                          style={{
                            width: "100%",
                            height: 100,
                            objectFit: "cover",
                          }}
                        />
                        <div
                          style={{
                            position: "absolute",
                            top: 8,
                            right: 8,
                            width: 22,
                            height: 22,
                            borderRadius: "50%",
                            background: "#3b82f6",
                            color: "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {i + 1}
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {!capturedPhotos[currentPhotoIndex] && (
                <button
                  onClick={startCountdown}
                  disabled={isCapturing}
                  style={{
                    padding: "18px 32px",
                    fontSize: "18px",
                    background: isCapturing
                      ? "#94a3b8"
                      : "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                    color: "white",
                    border: "none",
                    borderRadius: "50px",
                    cursor: isCapturing ? "not-allowed" : "pointer",
                    fontWeight: "bold",
                    boxShadow: isCapturing
                      ? "none"
                      : "0 8px 20px rgba(239, 68, 68, 0.3)",
                    transition: "all 0.3s ease",
                    width: "100%",
                  }}
                >
                  {isCapturing ? "拍攝中..." : "📸 拍攝照片"}
                </button>
              )}

              {capturedPhotos[currentPhotoIndex] && (
                <>
                  <div
                    style={{
                      fontSize: "20px",
                      fontWeight: "bold",
                      background: "linear-gradient(135deg, #667eea, #764ba2)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                      marginBottom: "20px",
                      textAlign: "center",
                    }}
                  >
                    🎉 第{currentPhotoIndex + 1}張照片拍攝完成!
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: "12px",
                      marginBottom: "20px",
                    }}
                  >
                    <button
                      onClick={retakePhoto}
                      style={{
                        flex: 1,
                        padding: "14px 20px",
                        fontSize: "16px",
                        background: "#ffffff",
                        color: "#4a5568",
                        border: "2px solid #e2e8f0",
                        borderRadius: "12px",
                        cursor: "pointer",
                        fontWeight: "bold",
                        transition: "all 0.3s ease",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                      }}
                    >
                      🔄 重新拍攝
                    </button>

                    <button
                      onClick={nextPhoto}
                      style={{
                        flex: 1,
                        padding: "14px 20px",
                        fontSize: "16px",
                        background:
                          "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                        color: "white",
                        border: "none",
                        borderRadius: "12px",
                        cursor: "pointer",
                        fontWeight: "bold",
                        transition: "all 0.3s ease",
                        boxShadow: "0 4px 12px rgba(102, 126, 234, 0.3)",
                      }}
                    >
                      {currentPhotoIndex < 3 ? "✅ 保留照片" : "🎯 完成拍攝"}
                    </button>
                  </div>

                  <div
                    style={{
                      background: "linear-gradient(135deg, #e0f2fe, #b3e5fc)",
                      padding: "16px",
                      borderRadius: "12px",
                      textAlign: "center",
                      fontSize: "16px",
                      color: "#0277bd",
                      fontWeight: "bold",
                      border: "1px solid #81d4fa",
                    }}
                  >
                    📊 拍攝進度: {currentPhotoIndex + 1}/4
                  </div>
                </>
              )}

              {/* 依設計移除返回首頁按鈕 */}
            </div>
          </div>

          {error && (
            <div
              style={{
                color: "#dc2626",
                background: "linear-gradient(135deg, #fef2f2, #fee2e2)",
                padding: "16px",
                borderRadius: "12px",
                marginTop: 20,
                border: "1px solid #fecaca",
                textAlign: "center",
                fontWeight: "bold",
                boxShadow: "0 2px 8px rgba(220, 38, 38, 0.1)",
              }}
            >
              ⚠️ 錯誤：{error}
            </div>
          )}

          {/* 隱藏的canvas用於拍照 */}
          <canvas ref={captureCanvasRef} style={{ display: "none" }} />
        </div>
      </div>
    );
  }

  if (step === "compose") {
    return (
      <div
        style={{
          height: "100vh",
          width: "100vw",
          background: "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxSizing: "border-box",
          overflow: "hidden",
          position: "fixed",
          top: 0,
          left: 0,
        }}
      >
        <div
          style={{
            maxWidth: 960,
            margin: "0 auto",
            padding: 24,
            background: "white",
            borderRadius: "20px",
            boxShadow: "0 20px 40px rgba(0,0,0,0.1)",
          }}
        >
          <h2>步驟 5：拼貼預覽</h2>
          <canvas
            ref={canvasRef}
            style={{
              width: 360,
              height: 480,
              border: "1px solid #ddd",
              borderRadius: 8,
            }}
          />
          <div style={{ marginTop: 12, display: "flex", gap: 12 }}>
            <button onClick={() => setStep("camera")}>上一步</button>
            <button onClick={composeCollage} disabled={!canCompose}>
              合成 2x2 拍貼
            </button>
          </div>
          {error && <div style={{ color: "red" }}>錯誤：{error}</div>}
        </div>
      </div>
    );
  }

  // edit
  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        background: "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)",
        boxSizing: "border-box",
        overflow: "hidden",
        position: "fixed",
        top: 0,
        left: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "3rem",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "white",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          margin: "0 2rem",
        }}
      >
        {/* <h2
          style={{
            textAlign: "center",
            marginBottom: "16px",
            padding: "16px 0",
            background: "linear-gradient(135deg, #667eea, #764ba2)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            fontSize: "1.6rem",
            fontWeight: "bold",
            flexShrink: 0,
          }}
        >
          🎨 風格轉換與輸出
        </h2> */}

        <div
          style={{
            display: "flex",
            gap: "0",
            alignItems: "stretch",
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          {/* 左側：照片預覽 */}
          <div
            style={{
              flex: "0 0 50%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              padding: "0 10px 0 20px",
            }}
          >
            <div
              style={{
                background: "#f8fafc",
                borderRadius: "12px",
                padding: "16px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              <h3
                style={{
                  textAlign: "center",
                  marginBottom: "16px",
                  color: "#2d3748",
                  fontSize: "1.2rem",
                  fontWeight: "bold",
                  flexShrink: 0,
                }}
              >
                📸 照片預覽
              </h3>
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  flex: 1,
                  alignItems: "center",
                  overflow: "hidden",
                }}
              >
                {stylizedUrl ? (
                  <img
                    src={stylizedUrl}
                    alt="stylized"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      border: "2px solid #e2e8f0",
                      borderRadius: "12px",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                    }}
                  />
                ) : (
                  <>
                    <img
                      src={collageDataUrl || undefined}
                      alt="collage"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        border: "2px solid #e2e8f0",
                        borderRadius: "12px",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                      }}
                    />
                    <canvas
                      ref={canvasRef}
                      style={{ display: collageDataUrl ? "none" : "block" }}
                    />
                  </>
                )}
              </div>
            </div>
          </div>

          {/* 右側：風格選擇 */}
          <div
            style={{
              flex: "0 0 50%",
              height: "100%",
              overflow: "hidden",
              padding: "0 20px 0 10px",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                height: "100%",
                overflowY: "auto",
                paddingRight: "8px",
                // 隱藏滾動條但保持滾動功能
                scrollbarWidth: "none", // Firefox
                msOverflowStyle: "none", // IE/Edge
              }}
              className="hide-scrollbar"
            >
              {/* 風格選擇區域 */}
              <div
                style={{
                  background: "linear-gradient(135deg, #f8fafc, #e2e8f0)",
                  borderRadius: "8px",
                  padding: "12px",
                  border: "1px solid #cbd5e0",
                  flexShrink: 0,
                }}
              >
                <h3
                  style={{
                    marginBottom: "10px",
                    color: "#2d3748",
                    fontSize: "1rem",
                    fontWeight: "bold",
                    textAlign: "center",
                  }}
                >
                  🎨 風格選擇
                </h3>

                <div style={{ display: "flex", gap: "16px" }}>
                  {/* 左側：相框背景風格 */}
                  <div style={{ flex: 1 }}>
                    <h4
                      style={{
                        marginBottom: "12px",
                        color: "#0277bd",
                        fontSize: "1rem",
                        fontWeight: "bold",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      🖼️ 相框背景風格
                    </h4>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, 1fr)",
                        gap: "8px",
                      }}
                    >
                      {Object.keys(BG_STYLES).map((k) => {
                        const active = bgKey === (k as keyof typeof BG_STYLES);
                        return (
                          <button
                            key={k}
                            style={{
                              padding: "8px 10px",
                              borderRadius: "8px",
                              border: active
                                ? "2px solid #0288d1"
                                : "2px solid #e0e0e0",
                              background: active ? "#0288d1" : "#ffffff",
                              color: active ? "#ffffff" : "#424242",
                              fontSize: "12px",
                              fontWeight: active ? "bold" : "normal",
                              cursor: "pointer",
                              transition: "all 0.3s ease",
                              boxShadow: active
                                ? "0 2px 8px rgba(2, 136, 209, 0.3)"
                                : "0 1px 4px rgba(0,0,0,0.1)",
                            }}
                            onClick={() =>
                              setBgKey(k as keyof typeof BG_STYLES)
                            }
                          >
                            {k}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 右側：照片人像風格 */}
                  <div style={{ flex: 1 }}>
                    <h4
                      style={{
                        marginBottom: "12px",
                        color: "#7b1fa2",
                        fontSize: "1rem",
                        fontWeight: "bold",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      👤 照片人像風格
                    </h4>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, 1fr)",
                        gap: "8px",
                      }}
                    >
                      {Object.keys(PHOTO_STYLES).map((k) => {
                        const active =
                          photoKey === (k as keyof typeof PHOTO_STYLES);
                        return (
                          <button
                            key={k}
                            style={{
                              padding: "8px 10px",
                              borderRadius: "8px",
                              border: active
                                ? "2px solid #8e24aa"
                                : "2px solid #e0e0e0",
                              background: active ? "#8e24aa" : "#ffffff",
                              color: active ? "#ffffff" : "#424242",
                              fontSize: "12px",
                              fontWeight: active ? "bold" : "normal",
                              cursor: "pointer",
                              transition: "all 0.3s ease",
                              boxShadow: active
                                ? "0 2px 8px rgba(142, 36, 170, 0.3)"
                                : "0 1px 4px rgba(0,0,0,0.1)",
                            }}
                            onClick={() =>
                              setPhotoKey(k as keyof typeof PHOTO_STYLES)
                            }
                          >
                            {k}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* 自定義文字編輯 */}
              <div
                style={{
                  background: "linear-gradient(135deg, #f0f9ff, #e0f2fe)",
                  borderRadius: "8px",
                  padding: "12px",
                  border: "1px solid #0ea5e9",
                  flexShrink: 0,
                }}
              >
                <h3
                  style={{
                    marginBottom: "8px",
                    color: "#0369a1",
                    fontSize: "0.95rem",
                    fontWeight: "bold",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  ✏️ 自定義文字
                </h3>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  <label
                    style={{
                      fontSize: "14px",
                      fontWeight: "bold",
                      color: "#475569",
                    }}
                  >
                    照片下方顯示的文字：
                  </label>
                  <input
                    type="text"
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    placeholder="輸入要顯示的文字..."
                    style={{
                      padding: "12px 16px",
                      fontSize: "16px",
                      border: "2px solid #e2e8f0",
                      borderRadius: "10px",
                      background: "#ffffff",
                      color: "#2d3748",
                      fontWeight: "bold",
                      transition: "all 0.3s ease",
                      outline: "none",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = "#0ea5e9";
                      e.target.style.boxShadow =
                        "0 4px 12px rgba(14, 165, 233, 0.3)";
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = "#e2e8f0";
                      e.target.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
                    }}
                  />
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#64748b",
                      fontStyle: "italic",
                    }}
                  >
                    💡 提示：文字會即時顯示在左側預覽中
                  </div>
                </div>
              </div>

              {/* 操作按鈕 */}
              <div
                style={{
                  background: "linear-gradient(135deg, #fff3e0, #ffe0b2)",
                  borderRadius: "8px",
                  padding: "12px",
                  border: "1px solid #ffcc02",
                  flexShrink: 0,
                }}
              >
                <h3
                  style={{
                    marginBottom: "8px",
                    color: "#f57c00",
                    fontSize: "0.95rem",
                    fontWeight: "bold",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  ⚙️ 操作選項
                </h3>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  <button
                    onClick={() => setStep("camera")}
                    style={{
                      padding: "10px 16px",
                      fontSize: "13px",
                      background: "#ffffff",
                      color: "#4a5568",
                      border: "2px solid #e2e8f0",
                      borderRadius: "8px",
                      cursor: "pointer",
                      fontWeight: "bold",
                      transition: "all 0.3s ease",
                      boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                    }}
                  >
                    🔄 重新拍攝
                  </button>

                  <button
                    disabled={!collageDataUrl || !!loadingStyleKey}
                    onClick={runStyling}
                    style={{
                      padding: "10px 16px",
                      fontSize: "13px",
                      background: loadingStyleKey
                        ? "#94a3b8"
                        : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                      color: "white",
                      border: "none",
                      borderRadius: "8px",
                      cursor: loadingStyleKey ? "not-allowed" : "pointer",
                      fontWeight: "bold",
                      transition: "all 0.3s ease",
                      boxShadow: loadingStyleKey
                        ? "none"
                        : "0 2px 8px rgba(102, 126, 234, 0.3)",
                    }}
                  >
                    {loadingStyleKey ? "🎨 處理中…" : "🎨 套用風格並生成"}
                  </button>

                  <button
                    onClick={downloadImage}
                    disabled={!stylizedUrl && !collageDataUrl}
                    style={{
                      padding: "10px 16px",
                      fontSize: "13px",
                      background:
                        !stylizedUrl && !collageDataUrl
                          ? "#94a3b8"
                          : "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                      color: "white",
                      border: "none",
                      borderRadius: "8px",
                      cursor:
                        !stylizedUrl && !collageDataUrl
                          ? "not-allowed"
                          : "pointer",
                      fontWeight: "bold",
                      transition: "all 0.3s ease",
                      boxShadow:
                        !stylizedUrl && !collageDataUrl
                          ? "none"
                          : "0 2px 8px rgba(16, 185, 129, 0.3)",
                    }}
                  >
                    💾 下載照片
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div
            style={{
              color: "#dc2626",
              background: "linear-gradient(135deg, #fef2f2, #fee2e2)",
              padding: "16px",
              borderRadius: "12px",
              marginTop: "20px",
              border: "1px solid #fecaca",
              textAlign: "center",
              fontWeight: "bold",
              boxShadow: "0 2px 8px rgba(220, 38, 38, 0.1)",
            }}
          >
            ⚠️ 錯誤：{error}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
