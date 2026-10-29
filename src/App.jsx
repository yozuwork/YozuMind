import { useEffect } from 'react';
import { initializeMindMap } from './mindmap.js';

function Sidebar() { return (<aside className="side" id="side" aria-label="心智圖列表">
    <div className="ws">
      <div className="ws-mark">Y</div>
      <div className="ws-name">YoZu 心智圖</div>
      <button className="icon-btn" id="closeSide" title="收起側欄" aria-label="收起側欄">
        <i className="bi bi-chevron-double-left" aria-hidden="true"></i>
      </button>
    </div>
    <label className="search">
      <i className="bi bi-search" aria-hidden="true"></i>
      <input id="search" type="text" placeholder="搜尋心智圖" autoComplete="off" />
    </label>
    <button className="side-act" id="newBtn">
      <i className="bi bi-plus-lg" aria-hidden="true"></i>
      新增心智圖
    </button>
    <div className="sec"><span>心智圖</span><span id="count"></span></div>
    <div className="pages" id="pages"></div>
    <div className="file-actions" aria-label="檔案管理">
      <button className="side-act" id="importBtn"><i className="bi bi-folder2-open" aria-hidden="true"></i>匯入 JSON 存檔</button>
      <button className="side-act" id="exportBtn"><i className="bi bi-download" aria-hidden="true"></i>匯出目前心智圖</button>
      <button className="side-act" id="exportAllBtn"><i className="bi bi-archive" aria-hidden="true"></i>備份全部心智圖</button>
      <input id="importFile" type="file" accept=".json,application/json" hidden />
      <p>編輯自動暫存於此瀏覽器</p>
    </div>
    <div className="side-foot"><span className="dotst" id="stDot"></span><span id="stText">載入中…</span></div>
  </aside>); }
function Toolbar() { return (<header className="topbar">
      <button className="icon-btn" id="openSide" title="打開側欄" aria-label="打開側欄">
        <i className="bi bi-list" aria-hidden="true"></i>
      </button>
      <button className="crumb-icon" id="crumbIcon" title="更換圖示" aria-label="更換圖示"><i className="bi bi-diagram-3" aria-hidden="true"></i></button>
      <input className="title-input" id="title" type="text" placeholder="未命名心智圖" aria-label="心智圖名稱" />
      <span className="ro-badge" id="roBadge" hidden>唯讀</span>
      <div className="seg" role="group" aria-label="排列方向">
        <button id="layDown" title="向下展開">
          <i className="bi bi-diagram-3" aria-hidden="true"></i><span className="lbl">向下</span>
        </button>
        <button id="layRight" title="向右展開">
          <i className="bi bi-diagram-3" aria-hidden="true"></i><span className="lbl">向右</span>
        </button>
      </div>
      <button className="icon-btn" id="imageBtn" title="加入圖片，也可以直接貼上" aria-label="加入圖片"><i className="bi bi-image" aria-hidden="true"></i></button>
      <input id="imageFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif" multiple hidden />
      <button className="icon-btn" id="relationBtn" title="關聯線：依序點選起點與終點" aria-label="新增關聯線"><i className="bi bi-bezier2" aria-hidden="true"></i></button>
      <button className="btn btn-ghost" id="shareBtn" title="分享">
        <span style={{display: "flex", alignItems: "center", gap: 6}}>
          <i className="bi bi-box-arrow-up" aria-hidden="true"></i>
          <span className="share-label">分享</span>
        </span>
      </button>
    </header>); }
function Canvas() { return (<div className="canvas" id="canvas" tabIndex="0" aria-label="心智圖畫布">
      <div className="world" id="world"><svg id="edges" width="1" height="1"></svg></div>

      <div className="nodebar" id="nodebar">
        <div className="tools">
          <button data-act="edit" title="編輯文字 (F2)"><i className="bi bi-pencil" aria-hidden="true"></i><span className="lbl">編輯</span></button>
          <button data-act="child" title="新增子節點 (Tab)"><i className="bi bi-plus-lg" aria-hidden="true"></i><span className="lbl">子節點</span></button>
          <button data-act="sibling" title="新增同層節點 (Enter)"><i className="bi bi-node-plus" aria-hidden="true"></i><span className="lbl">同層</span></button>
          <span className="sep" data-for="color"></span>
          <button data-act="color" title="分支顏色"><span className="swatch-dot" id="curSwatch"></span></button>
          <button data-act="collapse" title="收合／展開 (空白鍵)"><i className="bi bi-chevron-down" aria-hidden="true"></i></button>
          <span className="sep" data-for="del"></span>
          <button data-act="delete" className="del" title="刪除 (Delete)"><i className="bi bi-trash" aria-hidden="true"></i></button>
        </div>
        <div className="swatches" id="swatches"></div>
      </div>

      <div className="hint" id="hint">
        <span><kbd>Tab</kbd>子節點</span>
        <span><kbd>Enter</kbd>同層</span>
        <span><kbd>雙擊</kbd>編輯</span>
        <span><kbd>拖曳</kbd>移到其他節點下</span>
      </div>
      <div className="zoombar">
        <button id="zOut" title="縮小" aria-label="縮小"><i className="bi bi-dash-lg" aria-hidden="true"></i></button>
        <button id="zLabel" className="zl" title="重設為 100%">100%</button>
        <button id="zIn" title="放大" aria-label="放大"><i className="bi bi-plus-lg" aria-hidden="true"></i></button>
        <button id="zFit" title="置中整張圖" aria-label="置中整張圖">
          <i className="bi bi-arrows-fullscreen" aria-hidden="true"></i>
        </button>
      </div>

      <div className="empty-state" id="empty">
        <div className="empty-card">
          <h2 id="emptyTitle">載入中…</h2>
          <p id="emptyText"></p>
          <div className="row" id="emptyRow" hidden>
            <button className="btn btn-primary" id="emptyNew">新增空白心智圖</button>
            <button className="btn btn-ghost" id="emptySample">從 YoZuLife 範例開始</button>
          </div>
        </div>
      </div>
    </div>); }

export default function App() {
  useEffect(() => initializeMindMap(), []);
  return (<><div className="app" id="app">
  <Sidebar />
  <div className="scrim" id="scrim"></div>

  <main className="main">
    <Toolbar />

    <Canvas />
  </main>
</div>

<div className="pop" id="pageMenu" role="menu">
  <button className="mi" data-m="rename"><i className="bi bi-pencil" aria-hidden="true"></i>重新命名</button>
  <button className="mi" data-m="dup"><i className="bi bi-copy" aria-hidden="true"></i>建立副本</button>
  <button className="mi danger" data-m="del"><i className="bi bi-trash" aria-hidden="true"></i>刪除</button>
</div>
<div className="pop" id="iconPop"><div className="icon-grid" id="iconGrid"></div></div>
<div className="pop share-pop" id="sharePop">
  <h3>分享這張心智圖</h3>
  <p id="shareText"></p>
</div>
<div className="node" id="measure"></div>
<div className="toast" id="toast"></div></>);
}
