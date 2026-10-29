# YozuMind

React + Vite 繁體中文心智圖，介面統一使用 Bootstrap Icons。

## 開發

需要 Node.js 22.12 以上版本。

```sh
npm install
npm run dev
```

## 建置與部署

```sh
npm run build
npm run preview
npm run deploy
```

`npm run deploy` 會先建置，再將 dist 發佈到 gh-pages 分支。GitHub Settings → Pages 選擇 Deploy from a branch、gh-pages、/ (root)。

網站：https://yozuwork.github.io/YozuMind/

Windows PowerShell 若限制 npm 指令碼，可使用 npm.cmd。

## 功能與資料

保留多張心智圖、搜尋、複製、節點編輯、拖曳、分支顏色、收合、雙向排列、縮放、復原與重做。

資料儲存在瀏覽器 localStorage，沿用 yozu-mindmap-v1 格式並相容舊圖示。GitHub Pages 沒有帳號同步，分享網址不會分享本機心智圖。

src/App.jsx 負責 React 介面；src/mindmap.js 隔離原畫布與儲存引擎；src/styles.css 保留原介面與響應式樣式。原始 HTML 留作參考。

## 存檔與還原

側欄的「匯出目前心智圖」下載單張 JSON 存檔；「備份全部心智圖」下載完整備份。「匯入 JSON 存檔」可還原上述檔案，並支援原版資料陣列與單張心智圖 JSON。匯入會新增副本，不覆蓋現有資料，保留名稱、圖示、排列方向、節點、顏色與收合狀態。

檔案上限 5 MB、每批 100 張心智圖、共 10,000 個節點與 100 層。格式錯誤的整批匯入不會寫入資料。若瀏覽器空間不足會顯示暫存失敗提示，請匯出備份。清除瀏覽器網站資料會移除暫存，可使用 JSON 存檔還原。

存檔格式檢查：`node --test src/files.test.js`。
