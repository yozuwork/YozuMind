import { useEffect } from 'react';
import { initializeMindMap } from './mindmap.js';
import { RAIL_TOOLS } from './cards.js';

function Sidebar() { return (<aside className="side" id="side" aria-label="心智圖列表">
    <div className="ws">
      <div className="ws-mark">Y</div>
      <button className="ws-name workspace-trigger" id="workspaceBtn" title="切換或管理工作區" aria-haspopup="dialog"><span id="workspaceName">我的工作區</span><i className="bi bi-chevron-down" aria-hidden="true" /></button>
      <button className="icon-btn" id="closeSide" title="收起側欄" aria-label="收起側欄">
        <i className="bi bi-chevron-double-left" aria-hidden="true"></i>
      </button>
    </div>
    <button className="side-act" id="galleryBtn" title="收藏圖片，隨時加入心智圖">
      <i className="bi bi-images" aria-hidden="true"></i>
      圖庫
    </button>
    <button className="side-act" id="charactersBtn" title="所有角色、成長階段與常用階段"><i className="bi bi-person-badge" aria-hidden="true"></i>角色專區</button>
    <button className="side-act" id="notesBtn" title="記錄想法與管理關聯筆記"><i className="bi bi-journal-text" aria-hidden="true" />筆記專區</button>
    <div className="daily-area" id="dailyArea">
      <button className="side-act daily-open" id="dailyOpen" title="開啟每日獨立畫布"><i className="bi bi-calendar3" aria-hidden="true" /><span>每日心智圖</span><span className="daily-count" id="dailyCount" /></button>
    </div>
    <button className="side-act" id="sectionsBtn" title="管理工作分區"><i className="bi bi-grid-1x2" aria-hidden="true" /><span className="section-nav-label">工作分區</span><span className="section-nav-tag" id="sectionTag">一般分區</span></button>
    <div className="sec sidebar-library-heading" id="regularHeading"><span>心智圖</span><span id="count" /><div className="library-actions">
      <button className="icon-btn" id="searchToggle" title="搜尋心智圖" aria-label="搜尋心智圖" aria-expanded="false" aria-controls="sidebarSearch"><i className="bi bi-search" /></button>
      <button className="icon-btn" id="newBtn" title="新增心智圖" aria-label="新增心智圖"><i className="bi bi-plus-lg" /></button>
      <button className="icon-btn" id="newFolderBtn" title="新增資料夾" aria-label="新增資料夾"><i className="bi bi-folder-plus" /></button>
    </div></div>
    <label className="search" id="sidebarSearch" hidden><i className="bi bi-search" aria-hidden="true" /><input id="search" type="text" placeholder="搜尋心智圖" autoComplete="off" /></label>
    <div className="pages" id="pages"></div>
    <div className="daily-content" id="dailyContent" hidden>
      <div className="sec">當日心智圖</div><div id="dailyPages"></div>
      <div className="sec">關聯到這一天</div><div id="dailyLinks"></div>
    </div>
    <div className="file-actions" aria-label="檔案管理">
      <button className="side-act" id="importBtn" title="匯入 ZIP 存檔或舊版 JSON，保留現有資料"><i className="bi bi-folder2-open" aria-hidden="true"></i>匯入存檔</button>
      <button className="side-act" id="exportBtn" title="選擇要匯出的工作區與內容"><i className="bi bi-download" aria-hidden="true"></i>匯出存檔</button>
      <button className="side-act" id="exportAllBtn" title="將所有工作區與完整內容打包成 ZIP"><i className="bi bi-archive" aria-hidden="true"></i>備份所有工作區</button>
      <button className="side-act" id="folderBackupBtn" title="設定本機資料夾與自動備份"><i className="bi bi-folder-check" aria-hidden="true" />資料夾自動備份</button>
      <p id="folderBackupStatus" role="status">尚未設定備份資料夾</p>
      <input id="importFile" type="file" accept=".zip,.json,application/zip,application/x-zip-compressed,application/json" hidden />
      <p>編輯自動暫存於此瀏覽器</p>
      <p>ZIP 包含圖片、文件、圖庫、筆記與關聯紀錄，可在其他裝置直接匯入。</p>
    </div>
    <div className="side-foot"><span className="dotst" id="stDot"></span><span id="stText">載入中…</span></div>
  </aside>); }
function DailyToolbar() { return (
  <section className="daily-workspace-bar" id="dailyControls" aria-label="每日心智圖專區" hidden>
    <div className="daily-heading">
      <span className="daily-emblem" aria-hidden="true"><i className="bi bi-calendar3" /></span>
      <h1>每日心智圖</h1>
    </div>
    <div className="daily-date-nav" role="group" aria-label="切換日期">
      <button className="icon-btn" id="dailyPrev" title="前一天" aria-label="前一天"><i className="bi bi-chevron-left" aria-hidden="true" /></button>
      <input type="date" id="dailyDate" min="0001-01-01" max="9999-12-31" aria-label="每日心智圖日期" />
      <button className="icon-btn" id="dailyNext" title="後一天" aria-label="後一天"><i className="bi bi-chevron-right" aria-hidden="true" /></button>
      <button className="daily-today" id="dailyToday">今天</button>
    </div>
    <span id="dailyWeekday" />
  </section>
); }
function Toolbar() { return (<header className="topbar">
      <button className="icon-btn" id="openSide" title="打開側欄" aria-label="打開側欄">
        <i className="bi bi-list" aria-hidden="true"></i>
      </button>
      <button className="icon-btn daily-return" id="dailyBack" title="返回一般心智圖" aria-label="返回一般心智圖" hidden><i className="bi bi-arrow-left" aria-hidden="true" /></button>
      <nav className="crumbs" id="crumbs" aria-label="頁面路徑" hidden></nav>
      <button className="crumb-icon" id="crumbIcon" title="更換便利貼顏色" aria-label="更換便利貼顏色"></button>
      <input className="title-input" id="title" type="text" placeholder="未命名心智圖" aria-label="心智圖名稱" />
      <span className="ro-badge" id="roBadge" hidden>唯讀</span>
      <button className="icon-btn" id="layersBtn" title="圖層：選取被遮住的物件" aria-label="圖層" aria-expanded="false"><i className="bi bi-layers" aria-hidden="true" /></button>
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
      {[['title','標題','type-h1'],['color','顏色','palette'],['smaller','縮小文字','fonts'],['bigger','放大文字','fonts'],['todo','待辦','check2-square'],['code','程式碼','code-slash'],['rename','角色名稱','person-badge'],['image','加入圖片','image'],['removeImage','移除圖片','image-fill'],['links','連動清單','list-check'],['delete','刪除','trash']].map(([k,label,ic]) => (
        <button className="rail-tool" data-ctx={k} key={k} title={label}>
          <span className="rail-icon"><i className={`bi bi-${ic}${k==='smaller'?' fs-small':''}`} aria-hidden="true"></i></span>
          <span className="rail-label">{label}</span>
        </button>
      ))}
      <button className="rail-tool" data-ctx="stages" title="階段設定" hidden><span className="rail-icon"><i className="bi bi-layers" aria-hidden="true" /></span><span className="rail-label">階段設定</span></button>
      <button className="rail-tool" data-ctx="notes" title="關聯筆記"><span className="rail-icon"><i className="bi bi-journal-arrow-up" aria-hidden="true" /></span><span className="rail-label">關聯筆記</span></button>
      <div className="character-rail-info" id="characterRailInfo" hidden />
    </nav>); }
function ToolRail() { return (<nav className="toolrail" id="toolrail" aria-label="卡片工具">
      {RAIL_TOOLS.map(([type, label, icon]) => (
        <button className="rail-tool" data-tool={type} key={type} title={`${label}：點一下新增，或拖曳到畫布、欄位`}>
          <span className="rail-icon" dangerouslySetInnerHTML={{ __html: icon }}></span>
          <span className="rail-label">{label}</span>
        </button>
      ))}
      <button className="rail-tool" id="insertNoteBtn" title="插入關聯筆記"><span className="rail-icon"><i className="bi bi-journal-arrow-down" aria-hidden="true" /></span><span className="rail-label">關聯筆記</span></button>
      <button className="rail-tool" id="inboxBtn" title="這張心智圖的暫存區" aria-expanded="false"><span className="rail-icon"><i className="bi bi-inbox" aria-hidden="true" /><span className="inbox-count" hidden /></span><span className="rail-label">暫存區</span></button>
      <button className="rail-tool" id="arrangeBtn" title="一鍵排列：從左上角整齊排列畫布物件，可復原"><span className="rail-icon"><i className="bi bi-grid-3x3-gap" aria-hidden="true" /></span><span className="rail-label">一鍵排列</span></button>
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
        <input id="zRange" className="zoom-range" type="range" min="20" max="250" step="1" defaultValue="100" aria-label="畫布縮放比例" aria-valuetext="100%" />
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
    <DailyToolbar />

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
  <button className="mi" data-m="dailyLink"><i className="bi bi-calendar-plus" aria-hidden="true"></i>關聯到日期</button>
  <button className="mi" data-m="dup"><i className="bi bi-copy" aria-hidden="true"></i>建立副本</button>
  <button className="mi danger" data-m="del"><i className="bi bi-trash" aria-hidden="true"></i>刪除</button>
</div>
<div className="pop daily-link-pop" id="dailyLinkPop">
  <label htmlFor="mapLinkDate">關聯到每日心智圖</label>
  <input type="date" id="mapLinkDate" min="0001-01-01" max="9999-12-31" />
  <button className="mi" id="addMapDate">＋ 加入關聯日期</button>
  <div id="mapLinkedDates"></div>
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
