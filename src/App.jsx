import { useEffect } from 'react';
import { initializeMindMap } from './mindmap.js';
import { RAIL_TOOLS } from './cards.js';

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
    <button className="side-act" id="newFolderBtn">
      <i className="bi bi-folder-plus" aria-hidden="true"></i>
      新增資料夾
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
      <nav className="crumbs" id="crumbs" aria-label="頁面路徑" hidden></nav>
      <button className="crumb-icon" id="crumbIcon" title="更換便利貼顏色" aria-label="更換便利貼顏色"></button>
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
      <button className="icon-btn" id="attachBtn" title="加入 PDF、Word、Excel 檔案，也可以直接貼上或拖進畫布" aria-label="加入檔案"><i className="bi bi-paperclip" aria-hidden="true"></i></button>
      <input id="attachFile" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv" multiple hidden />
      <button className="icon-btn" id="themeBtn" title="切換色系" aria-label="切換色系"><i className="bi bi-moon-stars" aria-hidden="true"></i></button>
      <button className="btn btn-ghost" id="shareBtn" title="分享">
        <span style={{display: "flex", alignItems: "center", gap: 6}}>
          <i className="bi bi-box-arrow-up" aria-hidden="true"></i>
          <span className="share-label">分享</span>
        </span>
      </button>
    </header>); }
// Shown over the tool rail while a note (card or note-style node) is selected.
function NoteRail() { return (<nav className="toolrail ctx-rail" id="ctxRail" aria-label="筆記工具" hidden>
      <button className="ctx-back" data-ctx="back" title="返回工具列 (Esc)" aria-label="返回工具列"><i className="bi bi-arrow-left" aria-hidden="true"></i></button>
      {[['title','標題','type-h1'],['color','顏色','palette'],['smaller','縮小文字','fonts'],['bigger','放大文字','fonts'],['todo','待辦','check2-square'],['code','程式碼','code-slash'],['delete','刪除','trash']].map(([k,label,ic]) => (
        <button className="rail-tool" data-ctx={k} key={k} title={label}>
          <span className="rail-icon"><i className={`bi bi-${ic}${k==='smaller'?' fs-small':''}`} aria-hidden="true"></i></span>
          <span className="rail-label">{label}</span>
        </button>
      ))}
    </nav>); }
function ToolRail() { return (<nav className="toolrail" id="toolrail" aria-label="卡片工具">
      {RAIL_TOOLS.map(([type, label, icon]) => (
        <button className="rail-tool" data-tool={type} key={type} title={`${label}：點一下新增，或拖曳到畫布、欄位`}>
          <span className="rail-icon" dangerouslySetInnerHTML={{ __html: icon }}></span>
          <span className="rail-label">{label}</span>
        </button>
      ))}
      <button className="rail-tool" id="drawBtn" title="塗鴉：筆、螢光筆、橡皮擦與套索">
        <span className="rail-icon"><i className="bi bi-pencil" aria-hidden="true"></i></span>
        <span className="rail-label">塗鴉</span>
      </button>
      <span className="rail-sep" aria-hidden="true"></span>
      <button className="rail-tool" id="selectBtn" title="框選：拖曳範圍一次選取多個物件（任何時候也可按住 Shift 拖曳）">
        <span className="rail-icon"><i className="bi bi-bounding-box-circles" aria-hidden="true"></i></span>
        <span className="rail-label">框選</span>
      </button>
      <button className="rail-tool" id="relationBtn" title="關聯線：從物件拖到目標，或點選後選擇線型">
        <span className="rail-icon"></span>
        <span className="rail-label">關聯線</span>
      </button>
    </nav>); }
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
          <button data-act="style" title="節點樣式：一般／筆記／欄位"><i className="bi bi-sticky" aria-hidden="true"></i><span className="lbl">樣式</span></button>
          <button data-act="page" title="建立獨立頁面"><i className="bi bi-folder-plus" aria-hidden="true"></i></button>
          <button data-act="view" title="在側邊檢視內容"><i className="bi bi-layout-sidebar-reverse" aria-hidden="true"></i><span className="lbl">檢視內容</span></button>
          <span className="sep" data-for="del"></span>
          <button data-act="reset" title="還原自動排列的位置與大小"><i className="bi bi-arrow-counterclockwise" aria-hidden="true"></i></button>
          <button data-act="delete" className="del" title="刪除 (Delete)"><i className="bi bi-trash" aria-hidden="true"></i></button>
        </div>
        <div className="swatches" id="swatches"></div>
        <div className="node-styles" id="nodeStyles">
          <button data-nstyle="plain" title="一般節點"><i className="bi bi-type" aria-hidden="true"></i><span className="lbl">一般節點</span></button>
          <button data-nstyle="note" title="筆記：第一行是標題，其餘是內文"><i className="bi bi-sticky" aria-hidden="true"></i><span className="lbl">筆記</span></button>
          <button data-nstyle="column" title="欄位：第一行是標題，其餘每行一張小卡"><i className="bi bi-card-heading" aria-hidden="true"></i><span className="lbl">欄位</span></button>
        </div>
      </div>

      <div className="hint" id="hint">
        <span><kbd>Tab</kbd>子節點</span>
        <span><kbd>Enter</kbd>同層</span>
        <span><kbd>雙擊</kbd>編輯</span>
        <span><kbd>拖曳</kbd>移到其他節點下</span>
        <span><kbd>Shift</kbd>+拖曳 框選</span>
      </div>
      <div className="marquee" id="marquee" hidden></div>
      <div className="nodebar group-bar" id="groupBar">
        <div className="tools">
          <span className="group-count" id="groupCount"></span>
          <span className="sep"></span>
          <button data-gact="copy" title="複製 (Ctrl+C)"><i className="bi bi-copy" aria-hidden="true"></i></button>
          <button data-gact="delete" className="del" title="刪除 (Delete)"><i className="bi bi-trash" aria-hidden="true"></i></button>
          <button data-gact="clear" title="取消選取 (Esc)"><i className="bi bi-x-lg" aria-hidden="true"></i></button>
        </div>
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

// Side viewer for a page: an embedded copy of the app showing just that page.
function ViewPanel() { return (<aside className="view-panel" id="viewPanel" aria-label="檢視內容" hidden>
      <div className="view-head">
        <i className="bi bi-folder2-open" aria-hidden="true"></i>
        <span className="view-title" id="viewTitle"></span>
        <button className="icon-btn" id="viewOpen" title="在主畫面開啟" aria-label="在主畫面開啟"><i className="bi bi-box-arrow-in-up-right" aria-hidden="true"></i></button>
        <button className="icon-btn" id="viewFull" title="滿版" aria-label="滿版"><i className="bi bi-arrows-fullscreen" aria-hidden="true"></i></button>
        <button className="icon-btn" id="viewClose" title="關閉 (Esc)" aria-label="關閉"><i className="bi bi-x-lg" aria-hidden="true"></i></button>
      </div>
      <iframe className="view-frame" id="viewFrame" title="頁面內容"></iframe>
    </aside>); }

export default function App() {
  useEffect(() => initializeMindMap(), []);
  return (<><div className="app" id="app">
  <Sidebar />
  <div className="scrim" id="scrim"></div>

  <main className="main">
    <Toolbar />

    <div className="board">
      <ToolRail />
      <NoteRail />
      <Canvas />
    </div>
  </main>
  <ViewPanel />
</div>

<div className="pop" id="pageMenu" role="menu">
  <button className="mi" data-m="rename"><i className="bi bi-pencil" aria-hidden="true"></i>重新命名</button>
  <button className="mi" data-m="move"><i className="bi bi-folder-symlink" aria-hidden="true"></i>移到資料夾</button>
  <button className="mi" data-m="dup"><i className="bi bi-copy" aria-hidden="true"></i>建立副本</button>
  <button className="mi danger" data-m="del"><i className="bi bi-trash" aria-hidden="true"></i>刪除</button>
</div>
<div className="pop" id="folderMenu" role="menu">
  <button className="mi" data-f="rename"><i className="bi bi-pencil" aria-hidden="true"></i>重新命名</button>
  <button className="mi" data-f="sub"><i className="bi bi-folder-plus" aria-hidden="true"></i>新增子資料夾</button>
  <button className="mi" data-f="move"><i className="bi bi-folder-symlink" aria-hidden="true"></i>移到資料夾</button>
  <button className="mi" data-f="color"><i className="bi bi-palette" aria-hidden="true"></i>更換顏色</button>
  <button className="mi danger" data-f="del"><i className="bi bi-trash" aria-hidden="true"></i>刪除資料夾</button>
</div>
<div className="pop" id="movePop" role="menu"></div>
<div className="pop" id="folderColorPop"><div className="icon-grid color-grid" id="folderColorGrid"></div></div>
<div className="pop" id="iconPop"><div className="icon-grid color-grid" id="iconGrid"></div></div>
<div className="pop share-pop" id="sharePop">
  <h3>分享這張心智圖</h3>
  <p id="shareText"></p>
</div>
<div className="node" id="measure"></div>
<div className="toast" id="toast"></div></>);
}
