# PhotoBooth

一個以 React + Vite（前端）與 FastAPI（後端）打造的圖片風格生成/轉換示範。後端代理呼叫 Google Gemini Imagen 介面以生成圖片。

參考文件： [Google Gemini API - 使用 Imagen 生成圖片](https://ai.google.dev/gemini-api/docs/imagen?hl=zh-tw)

## 需求

- Python 3.10~3.12
- Node.js 18+

## 安裝與啟動

### Windows 啟動步驟

#### 後端（PowerShell）

1. 開啟 PowerShell 並進入專案目錄：
   ```powershell
   cd C:\Users\User\Desktop\PhotoBooth\backend
   ```

2. 建立並啟用虛擬環境：
   ```powershell
   # 若遇到執行原則限制，先執行：
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   
   # 建立虛擬環境（若尚未建立）
   python -m venv .venv
   
   # 啟用虛擬環境
   . .\.venv\Scripts\Activate.ps1
   ```

3. 安裝依賴：
   ```powershell
   pip install -r requirements.txt
   ```

4. 設定環境變數，在 `backend` 目錄建立 `.env` 檔案：
   ```ini
   GEMINI_API_KEY=your_api_key_here
   # 可選：STABILITY_API_KEY=your_stability_key_here
   ```
   > 可在 [Google AI for Developers](https://ai.google.dev/) 取得 API 金鑰

5. 啟動伺服器（推薦方式）：
   ```powershell
   # 使用虛擬環境內的 Python 執行 uvicorn（避免 PATH 問題）
   .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
   ```
   
   **常見問題解決：**
   - 若出現 `[WinError 10013]` 權限錯誤：
     - 改用 `127.0.0.1` 而非 `0.0.0.0`
     - 以系統管理員身分執行 PowerShell
     - 暫時關閉防毒軟體的網路保護
   - 若找不到 `uvicorn`：
     ```powershell
     pip install uvicorn[standard]
     ```

6. 驗證後端啟動成功：
   ```powershell
   # 測試健康檢查端點
   curl http://127.0.0.1:8000/api/health
   # 應回傳：{"status":"ok"}
   ```

#### 前端（PowerShell）

1. 開啟新的 PowerShell 視窗並進入前端目錄：
   ```powershell
   cd C:\Users\User\Desktop\PhotoBooth\frontend
   ```

2. 安裝依賴：
   ```powershell
   npm install
   ```

3. 啟動開發伺服器：
   ```powershell
   npm run dev
   ```

4. 瀏覽器開啟 `http://localhost:5173`

### 快速啟動腳本（推薦）

我們提供了 PowerShell 啟動腳本，讓啟動更簡單：

#### 後端快速啟動
```powershell
cd C:\Users\User\Desktop\PhotoBooth\backend
.\start_backend.ps1
```

#### 前端快速啟動
```powershell
cd C:\Users\User\Desktop\PhotoBooth\frontend
.\start_frontend.ps1
```

> 腳本會自動檢查依賴、設定環境，並提供清楚的錯誤訊息。

### Linux/macOS 啟動步驟

#### 後端

1. 進入 `backend`：
   ```bash
   cd backend
   ```
2. 建立並啟用虛擬環境：
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```
3. 安裝依賴：
   ```bash
   pip install -r requirements.txt
   ```
4. 設定環境變數，建立 `.env` 並填入：
   ```bash
   GEMINI_API_KEY=your_api_key_here
   ```
5. 啟動伺服器：
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

#### 前端

1. 進入 `frontend`：
   ```bash
   cd frontend
   ```
2. 安裝依賴：
   ```bash
   npm install
   ```
3. 開發啟動：
   ```bash
   npm run dev
   ```
   預設將在 `http://localhost:5173`，並透過 Vite 代理呼叫後端 `/api/*`。

### 可選：使用 Poetry（如你偏好）

```bash
cd backend
poetry install
poetry run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## 故障排除

### Windows 常見問題

1. **PowerShell 執行原則錯誤**
   ```powershell
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   ```

2. **找不到 uvicorn 指令**
   ```powershell
   # 使用完整路徑執行
   .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
   ```

3. **WinError 10013 權限錯誤**
   - 改用 `127.0.0.1` 而非 `0.0.0.0`
   - 以系統管理員身分執行 PowerShell
   - 檢查防火牆設定

4. **500 Internal Server Error**
   - 確認 `backend/.env` 檔案存在且包含 `GEMINI_API_KEY`
   - 檢查 API 金鑰是否有效

### 快速驗證

```powershell
# 後端健康檢查
curl http://127.0.0.1:8000/api/health

# 前端代理測試
curl http://localhost:5173/api/health
```

## 使用說明

- 在前端頁面輸入英文提示（提高品質），可調整比例、尺寸、人物生成等參數。
- 按下「生成圖片」後，前端會呼叫後端 `/api/generate`，後端再代理至 Google Imagen 服務並回傳 base64 圖片。
- 支援圖片風格轉換：上傳圖片後輸入風格描述，系統會使用 Gemini 2.5 Flash 或 Stability AI 進行風格轉換。

## API 端點

- `GET /api/health` - 健康檢查
- `POST /api/generate` - 文字生成圖片
- `POST /api/stylize` - 圖片風格轉換

## 注意事項

- 生成的人物需遵守地區限制與政策；`allow_all` 在部分地區（歐盟、英國、瑞士、MENA）不可用。
- `sampleImageSize` 僅適用於 Standard / Ultra 模型；`aspectRatio` 支援：`"1:1"`, `"3:4"`, `"4:3"`, `"9:16"`, `"16:9"`。
- 單次最多生成 1~4 張圖片。
- 需要有效的 Google Gemini API 金鑰才能使用圖片生成功能。

## 授權

此專案程式碼以 MIT License 釋出。


# 後端
cd C:\Users\User\Desktop\PhotoBooth\backend
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
. .\.venv\Scripts\Activate.ps1
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# 前端
cd C:\Users\User\Desktop\PhotoBooth\frontend
npm run dev
