/**
 * LP Visual Editor v2.1
 * どのHTMLにも1行追加するだけでnote風ビジュアル編集モードを追加
 *
 * 使い方: HTMLの</body>直前に以下を追加
 * <script src="lp-editor.js"></script>
 *
 * 起動方法: URLに ?edit を付ける or Ctrl+Shift+E (Mac: ⌘+Shift+E)
 * ※ 一般訪問者には編集UIは一切見えません
 *
 * 機能:
 *  ✏️ ボタンで編集モードON/OFF
 *  テキストをクリックして直接編集
 *  画像クリックで差し替え（URL / ファイル選択 / ドラッグ&ドロップ / ペースト）
 *  画像ワンクリック削除（✕ボタン）
 *  リンクのhref+テキスト編集
 *  💾 ボタンでHTMLをダウンロード保存
 */
(function() {
  'use strict';

  // === 起動方法 ===
  // 1. URLに ?edit を付ける（例: https://example.com/?edit）
  // 2. キーボード Ctrl+Shift+E / ⌘+Shift+E
  let editorReady = false;

  // URLパラメータで自動起動
  if (location.search.includes('edit')) {
    editorReady = true;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initEditor);
    } else {
      initEditor();
    }
  }

  // キーボードショートカットでも起動可能
  document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'E' || e.key === 'e')) {
      e.preventDefault();
      if (!editorReady) {
        editorReady = true;
        initEditor();
      } else {
        const root = document.getElementById('lp-editor-root');
        if (root) {
          root.style.display = root.style.display === 'none' ? '' : 'none';
        }
      }
    }
  });

  function initEditor() {

  // === CSS注入 ===
  const css = document.createElement('style');
  css.id = 'lp-editor-styles';
  css.textContent = `
    .lpe-toolbar {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 99999;
      display: flex;
      gap: 8px;
      align-items: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', sans-serif;
    }
    .lpe-btn {
      width: 52px; height: 52px;
      border-radius: 50%;
      border: none;
      cursor: pointer;
      font-size: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
      box-shadow: 0 4px 20px rgba(0,0,0,0.35);
    }
    .lpe-btn:hover { transform: scale(1.1); }
    .lpe-btn.lpe-toggle {
      background: #2563eb;
      color: #fff;
    }
    .lpe-btn.lpe-toggle.active {
      background: #dc2626;
    }
    .lpe-btn.lpe-save {
      background: #16a34a;
      color: #fff;
      display: none;
    }
    .lpe-btn.lpe-link {
      background: #7c3aed;
      color: #fff;
      display: none;
      font-size: 16px;
    }

    .lpe-notice {
      position: fixed;
      top: 0; left: 0; right: 0;
      background: rgba(37, 99, 235, 0.95);
      color: #fff;
      text-align: center;
      padding: 10px 16px;
      font-size: 14px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', sans-serif;
      z-index: 99998;
      display: none;
      backdrop-filter: blur(8px);
      line-height: 1.6;
    }
    .lpe-notice .lpe-sub { opacity: 0.7; font-size: 12px; margin-left: 12px; }

    /* 編集中テキスト */
    body.lpe-editing .lpe-editable {
      outline: 1px dashed rgba(37, 99, 235, 0.4) !important;
      outline-offset: 4px !important;
      cursor: text !important;
      transition: outline-color 0.2s;
    }
    body.lpe-editing .lpe-editable:hover {
      outline-color: #2563eb !important;
    }
    body.lpe-editing .lpe-editable:focus {
      outline: 2px solid #2563eb !important;
      outline-offset: 4px !important;
      background: rgba(37, 99, 235, 0.04) !important;
    }

    /* 編集中画像ラッパー */
    body.lpe-editing .lpe-img-wrap {
      position: relative !important;
      display: inline-block;
      cursor: pointer;
    }
    body.lpe-editing .lpe-img-wrap:hover {
      outline: 2px solid #2563eb;
      outline-offset: 4px;
    }

    /* 画像ホバー時のラベル */
    body.lpe-editing .lpe-img-label {
      position: absolute;
      bottom: 8px; left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.8);
      color: #fff;
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', sans-serif;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s;
      white-space: nowrap;
      z-index: 2;
    }
    body.lpe-editing .lpe-img-wrap:hover .lpe-img-label {
      opacity: 1;
    }

    /* 画像ワンクリック削除ボタン */
    body.lpe-editing .lpe-img-del {
      position: absolute;
      top: 6px; right: 6px;
      width: 28px; height: 28px;
      background: #dc2626;
      color: #fff;
      border: 2px solid rgba(255,255,255,0.8);
      border-radius: 50%;
      cursor: pointer;
      font-size: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.15s;
      z-index: 3;
      line-height: 1;
      padding: 0;
      font-family: -apple-system, sans-serif;
    }
    body.lpe-editing .lpe-img-wrap:hover .lpe-img-del {
      opacity: 1;
    }
    body.lpe-editing .lpe-img-del:hover {
      background: #ef4444;
      transform: scale(1.15);
    }

    /* ドラッグ中のドロップゾーン */
    body.lpe-editing .lpe-img-wrap.lpe-dragover {
      outline: 3px dashed #16a34a !important;
      outline-offset: 4px;
    }
    body.lpe-editing .lpe-img-wrap.lpe-dragover .lpe-img-label {
      opacity: 1;
      background: rgba(22, 163, 106, 0.9);
    }

    /* ページ全体ドロップゾーン */
    .lpe-page-dropzone {
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      background: rgba(37, 99, 235, 0.12);
      border: 4px dashed #2563eb;
      z-index: 99990;
      display: none;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }
    .lpe-page-dropzone.show { display: flex; }
    .lpe-page-dropzone-text {
      background: rgba(0,0,0,0.8);
      color: #fff;
      padding: 20px 40px;
      border-radius: 12px;
      font-size: 18px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', sans-serif;
    }

    /* 編集中リンク */
    body.lpe-editing .lpe-link-editable {
      outline: 1px dashed rgba(124, 58, 237, 0.4) !important;
      outline-offset: 2px !important;
    }
    body.lpe-editing .lpe-link-editable:hover {
      outline-color: #7c3aed !important;
    }

    /* モーダル */
    .lpe-overlay {
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      background: rgba(0,0,0,0.6);
      z-index: 100000;
      display: none;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(4px);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', sans-serif;
    }
    .lpe-overlay.show { display: flex; }
    .lpe-modal {
      background: #1a1a2e;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 12px;
      padding: 28px;
      max-width: 500px;
      width: 90%;
      color: #e0e0e0;
    }
    .lpe-modal h3 {
      font-size: 16px;
      font-weight: 600;
      margin: 0 0 6px;
    }
    .lpe-modal .lpe-modal-desc {
      font-size: 13px;
      color: #888;
      margin: 0 0 16px;
    }
    .lpe-modal input[type="text"] {
      width: 100%;
      padding: 10px 12px;
      background: #0f0f1a;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 6px;
      color: #e0e0e0;
      font-size: 14px;
      margin-bottom: 8px;
      box-sizing: border-box;
    }
    .lpe-modal input[type="text"]:focus {
      outline: none;
      border-color: #2563eb;
    }
    .lpe-modal input[type="file"] {
      width: 100%;
      margin-bottom: 12px;
      color: #888;
      font-size: 13px;
    }
    .lpe-modal .lpe-preview {
      max-width: 100%;
      max-height: 150px;
      display: block;
      margin: 8px auto 16px;
      border-radius: 6px;
      border: 1px solid rgba(255,255,255,0.08);
    }
    /* ドロップエリア */
    .lpe-drop-area {
      border: 2px dashed rgba(255,255,255,0.2);
      border-radius: 8px;
      padding: 24px;
      text-align: center;
      margin-bottom: 16px;
      cursor: pointer;
      transition: all 0.2s;
      color: #888;
      font-size: 13px;
    }
    .lpe-drop-area:hover, .lpe-drop-area.dragover {
      border-color: #2563eb;
      background: rgba(37, 99, 235, 0.06);
      color: #bbb;
    }
    .lpe-drop-area .lpe-drop-icon { font-size: 28px; display: block; margin-bottom: 8px; }
    .lpe-drop-area .lpe-drop-or { font-size: 11px; color: #666; margin-top: 4px; }

    .lpe-modal-btns {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
    .lpe-modal-btn {
      padding: 8px 20px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
    }
    .lpe-modal-btn:hover { opacity: 0.85; }
    .lpe-modal-btn.ok { background: #2563eb; color: #fff; }
    .lpe-modal-btn.cancel { background: transparent; color: #888; border: 1px solid rgba(255,255,255,0.12); }

    /* リンク編集モーダル */
    .lpe-modal label {
      display: block;
      font-size: 12px;
      color: #888;
      margin-bottom: 4px;
      margin-top: 12px;
    }
    .lpe-modal label:first-of-type { margin-top: 0; }

    /* 通知トースト */
    .lpe-toast {
      position: fixed;
      top: 60px; left: 50%;
      transform: translateX(-50%);
      background: #16a34a;
      color: #fff;
      padding: 10px 24px;
      border-radius: 8px;
      font-size: 14px;
      z-index: 100001;
      opacity: 0;
      transition: opacity 0.3s;
      pointer-events: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', sans-serif;
    }
    .lpe-toast.show { opacity: 1; }
  `;
  document.head.appendChild(css);

  // === HTML注入 ===
  const wrapper = document.createElement('div');
  wrapper.id = 'lp-editor-root';
  wrapper.innerHTML = `
    <div class="lpe-overlay" id="lpeImgModal">
      <div class="lpe-modal">
        <h3>画像を変更</h3>
        <p class="lpe-modal-desc">ドロップ / ペースト / ファイル選択 / URL入力</p>
        <div class="lpe-drop-area" id="lpeDropArea">
          <span class="lpe-drop-icon">📁</span>
          ここに画像をドロップ、またはクリックでファイル選択
          <div class="lpe-drop-or">Ctrl+V (⌘V) でクリップボードから貼り付けも可能</div>
        </div>
        <input type="file" id="lpeImgFile" accept="image/*" style="display:none">
        <input type="text" id="lpeImgUrl" placeholder="または画像URL（https://...）">
        <img class="lpe-preview" id="lpeImgPreview" style="display:none">
        <div class="lpe-modal-btns">
          <button class="lpe-modal-btn cancel" id="lpeImgCancel">キャンセル</button>
          <button class="lpe-modal-btn ok" id="lpeImgOk">変更する</button>
        </div>
      </div>
    </div>
    <div class="lpe-overlay" id="lpeLinkModal">
      <div class="lpe-modal">
        <h3>リンクを編集</h3>
        <p class="lpe-modal-desc">リンク先URLと表示テキストを編集できます</p>
        <label>リンク先URL</label>
        <input type="text" id="lpeLinkHref" placeholder="https://...">
        <label>表示テキスト</label>
        <input type="text" id="lpeLinkText" placeholder="ボタンの文字">
        <div class="lpe-modal-btns">
          <button class="lpe-modal-btn cancel" id="lpeLinkCancel">キャンセル</button>
          <button class="lpe-modal-btn ok" id="lpeLinkOk">変更する</button>
        </div>
      </div>
    </div>
    <div class="lpe-page-dropzone" id="lpePageDrop">
      <div class="lpe-page-dropzone-text">📁 画像をドロップして差し替え</div>
    </div>
    <div class="lpe-notice" id="lpeNotice">
      ✏️ 編集モード — テキスト直接編集 / 画像: クリック・ドロップ・ペーストで差替え / ✕で削除
      <span class="lpe-sub">（💾で保存）</span>
    </div>
    <div class="lpe-toolbar">
      <button class="lpe-btn lpe-link" id="lpeLinkBtn" title="リンク編集モード">🔗</button>
      <button class="lpe-btn lpe-save" id="lpeSaveBtn" title="保存（HTMLをダウンロード）">💾</button>
      <button class="lpe-btn lpe-toggle" id="lpeToggle" title="編集モード切替">✏️</button>
    </div>
    <div class="lpe-toast" id="lpeToast"></div>
  `;
  document.body.appendChild(wrapper);

  // === 要素取得 ===
  const toggleBtn = document.getElementById('lpeToggle');
  const saveBtn = document.getElementById('lpeSaveBtn');
  const linkBtn = document.getElementById('lpeLinkBtn');
  const notice = document.getElementById('lpeNotice');
  const imgModal = document.getElementById('lpeImgModal');
  const imgUrl = document.getElementById('lpeImgUrl');
  const imgFile = document.getElementById('lpeImgFile');
  const imgPreview = document.getElementById('lpeImgPreview');
  const imgOk = document.getElementById('lpeImgOk');
  const imgCancel = document.getElementById('lpeImgCancel');
  const dropArea = document.getElementById('lpeDropArea');
  const linkModal = document.getElementById('lpeLinkModal');
  const linkHref = document.getElementById('lpeLinkHref');
  const linkText = document.getElementById('lpeLinkText');
  const linkOk = document.getElementById('lpeLinkOk');
  const linkCancel = document.getElementById('lpeLinkCancel');
  const pageDrop = document.getElementById('lpePageDrop');
  const toast = document.getElementById('lpeToast');

  let editing = false;
  let linkEditing = false;
  let currentImg = null;
  let currentLink = null;
  let lastHoveredImg = null;

  const TEXT_SELECTOR = [
    'h1','h2','h3','h4','h5','h6',
    'p','li','td','th','figcaption',
    'blockquote','dt','dd',
    'span:not(.lpe-sub)', 'label', 'strong', 'em'
  ].join(',');

  function isEditorEl(el) {
    return el && (el.closest('#lp-editor-root') || el.closest('.lpe-toolbar') || el.closest('.lpe-notice'));
  }

  // === ファイルをdata URLに変換 ===
  function fileToDataUrl(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsDataURL(file);
    });
  }

  // === 画像ファイルを取得するヘルパー ===
  function getImageFile(dt) {
    if (dt.files && dt.files.length > 0) {
      for (const f of dt.files) {
        if (f.type.startsWith('image/')) return f;
      }
    }
    return null;
  }

  // === 編集モード ON ===
  function enableEditing() {
    document.body.classList.add('lpe-editing');
    toggleBtn.classList.add('active');
    toggleBtn.textContent = '✕';
    saveBtn.style.display = 'flex';
    linkBtn.style.display = 'flex';
    notice.style.display = 'block';

    // テキスト編集可能に
    document.querySelectorAll(TEXT_SELECTOR).forEach(el => {
      if (isEditorEl(el)) return;
      if (el.querySelector('h1,h2,h3,h4,h5,h6,p,ul,ol,div,blockquote')) return;
      el.contentEditable = true;
      el.classList.add('lpe-editable');
    });

    // 画像をラップ
    document.querySelectorAll('img').forEach(img => {
      if (isEditorEl(img)) return;
      if (img.closest('.lpe-img-wrap')) return;
      wrapImage(img);
    });

    // リンクのナビゲーションを無効化
    document.querySelectorAll('a').forEach(a => {
      if (isEditorEl(a)) return;
      a.addEventListener('click', preventNav, true);
    });

    // ページ全体ドラッグ&ドロップ（画像がない場所にドロップした時用）
    document.addEventListener('dragenter', onPageDragEnter, true);
    document.addEventListener('dragover', onPageDragOver, true);
    document.addEventListener('dragleave', onPageDragLeave, true);
    document.addEventListener('drop', onPageDrop, true);

    // ペースト（Ctrl+V）で画像挿入
    document.addEventListener('paste', onPaste, true);
  }

  // === 画像ラッパー作成 ===
  function wrapImage(img) {
    const wrap = document.createElement('div');
    wrap.className = 'lpe-img-wrap';
    wrap.style.display = 'inline-block';
    wrap.style.width = img.style.width || '';

    // 削除ボタン
    const delBtn = document.createElement('button');
    delBtn.className = 'lpe-img-del';
    delBtn.textContent = '✕';
    delBtn.title = '画像を削除';
    delBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      wrap.remove();
      showToast('🗑 画像を削除しました');
    });

    // ラベル
    const label = document.createElement('div');
    label.className = 'lpe-img-label';
    label.textContent = 'クリックで変更 / ドロップで差替え';

    img.parentNode.insertBefore(wrap, img);
    wrap.appendChild(img);
    wrap.appendChild(delBtn);
    wrap.appendChild(label);

    // クリックで画像変更モーダル
    wrap.addEventListener('click', function(e) {
      if (e.target === delBtn) return;
      e.preventDefault();
      e.stopPropagation();
      openImgModal(img);
    });

    // 個別画像へのドラッグ&ドロップ
    wrap.addEventListener('dragenter', function(e) {
      e.preventDefault();
      e.stopPropagation();
      wrap.classList.add('lpe-dragover');
      label.textContent = '📁 ここにドロップして差替え';
      lastHoveredImg = img;
    });
    wrap.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.stopPropagation();
    });
    wrap.addEventListener('dragleave', function(e) {
      e.preventDefault();
      wrap.classList.remove('lpe-dragover');
      label.textContent = 'クリックで変更 / ドロップで差替え';
    });
    wrap.addEventListener('drop', async function(e) {
      e.preventDefault();
      e.stopPropagation();
      wrap.classList.remove('lpe-dragover');
      label.textContent = 'クリックで変更 / ドロップで差替え';
      const file = getImageFile(e.dataTransfer);
      if (file) {
        img.src = await fileToDataUrl(file);
        showToast('✅ 画像を差し替えました');
      }
    });
  }

  // === 編集モード OFF ===
  function disableEditing() {
    document.body.classList.remove('lpe-editing');
    toggleBtn.classList.remove('active');
    toggleBtn.textContent = '✏️';
    saveBtn.style.display = 'none';
    linkBtn.style.display = 'none';
    notice.style.display = 'none';
    linkEditing = false;
    linkBtn.style.background = '#7c3aed';

    document.querySelectorAll('.lpe-editable').forEach(el => {
      el.contentEditable = false;
      el.classList.remove('lpe-editable');
    });

    document.querySelectorAll('.lpe-img-wrap').forEach(wrap => {
      const img = wrap.querySelector('img');
      if (img) wrap.parentNode.insertBefore(img, wrap);
      wrap.remove();
    });

    document.querySelectorAll('a').forEach(a => {
      a.removeEventListener('click', preventNav, true);
      a.classList.remove('lpe-link-editable');
    });

    document.removeEventListener('dragenter', onPageDragEnter, true);
    document.removeEventListener('dragover', onPageDragOver, true);
    document.removeEventListener('dragleave', onPageDragLeave, true);
    document.removeEventListener('drop', onPageDrop, true);
    document.removeEventListener('paste', onPaste, true);
  }

  function preventNav(e) {
    e.preventDefault();
    e.stopPropagation();
    if (linkEditing) openLinkModal(e.currentTarget);
  }

  // === トグル ===
  toggleBtn.addEventListener('click', function() {
    editing = !editing;
    editing ? enableEditing() : disableEditing();
  });

  // === リンク編集モード ===
  linkBtn.addEventListener('click', function() {
    linkEditing = !linkEditing;
    linkBtn.style.background = linkEditing ? '#dc2626' : '#7c3aed';
    document.querySelectorAll('a').forEach(a => {
      if (isEditorEl(a)) return;
      linkEditing ? a.classList.add('lpe-link-editable') : a.classList.remove('lpe-link-editable');
    });
    showToast(linkEditing ? '🔗 リンク編集ON — リンクをクリック' : '🔗 リンク編集OFF');
  });

  // === ページ全体ドラッグ&ドロップ ===
  let dragCounter = 0;
  function onPageDragEnter(e) {
    e.preventDefault();
    dragCounter++;
    if (dragCounter === 1 && !e.target.closest('.lpe-img-wrap')) {
      pageDrop.classList.add('show');
    }
  }
  function onPageDragOver(e) { e.preventDefault(); }
  function onPageDragLeave(e) {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      pageDrop.classList.remove('show');
    }
  }
  async function onPageDrop(e) {
    // 個別画像ラッパーでハンドル済みなら無視
    if (e.target.closest('.lpe-img-wrap')) {
      pageDrop.classList.remove('show');
      dragCounter = 0;
      return;
    }
    e.preventDefault();
    pageDrop.classList.remove('show');
    dragCounter = 0;
    const file = getImageFile(e.dataTransfer);
    if (!file) return;
    // 最も近い画像を差し替え or ホバー中の画像
    if (lastHoveredImg) {
      lastHoveredImg.src = await fileToDataUrl(file);
      showToast('✅ 画像を差し替えました');
    } else {
      showToast('⚠️ 差し替え先の画像の上にドロップしてください');
    }
  }

  // === ペースト（Ctrl+V / ⌘V）===
  async function onPaste(e) {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) return;
        const dataUrl = await fileToDataUrl(file);

        // モーダルが開いている場合はそこにセット
        if (imgModal.classList.contains('show') && currentImg) {
          imgUrl.value = dataUrl;
          imgPreview.src = dataUrl;
          imgPreview.style.display = 'block';
          showToast('📋 クリップボードから画像を貼り付けました');
          return;
        }

        // フォーカス中の画像があれば差し替え
        const activeWrap = document.querySelector('.lpe-img-wrap:hover');
        if (activeWrap) {
          const img = activeWrap.querySelector('img');
          if (img) {
            img.src = dataUrl;
            showToast('✅ ペーストで画像を差し替えました');
            return;
          }
        }

        showToast('💡 画像の上にカーソルを置いてからペーストしてください');
        return;
      }
    }
  }

  // === 画像モーダル ===
  function openImgModal(img) {
    currentImg = img;
    imgUrl.value = img.src;
    imgPreview.src = img.src;
    imgPreview.style.display = 'block';
    imgFile.value = '';
    imgModal.classList.add('show');
  }

  imgUrl.addEventListener('input', function() {
    if (this.value) {
      imgPreview.src = this.value;
      imgPreview.style.display = 'block';
    }
  });

  // ドロップエリア
  dropArea.addEventListener('click', () => imgFile.click());
  dropArea.addEventListener('dragenter', (e) => { e.preventDefault(); dropArea.classList.add('dragover'); });
  dropArea.addEventListener('dragover', (e) => { e.preventDefault(); });
  dropArea.addEventListener('dragleave', () => dropArea.classList.remove('dragover'));
  dropArea.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropArea.classList.remove('dragover');
    const file = getImageFile(e.dataTransfer);
    if (file) {
      const dataUrl = await fileToDataUrl(file);
      imgUrl.value = dataUrl;
      imgPreview.src = dataUrl;
      imgPreview.style.display = 'block';
    }
  });

  imgFile.addEventListener('change', async function() {
    const file = this.files[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    imgUrl.value = dataUrl;
    imgPreview.src = dataUrl;
    imgPreview.style.display = 'block';
  });

  imgOk.addEventListener('click', function() {
    if (currentImg && imgUrl.value) {
      currentImg.src = imgUrl.value;
      showToast('✅ 画像を変更しました');
    }
    closeImgModal();
  });

  imgCancel.addEventListener('click', closeImgModal);
  imgModal.addEventListener('click', function(e) { if (e.target === imgModal) closeImgModal(); });
  function closeImgModal() { imgModal.classList.remove('show'); currentImg = null; }

  // === リンクモーダル ===
  function openLinkModal(a) {
    currentLink = a;
    linkHref.value = a.getAttribute('href') || '';
    linkText.value = a.textContent || '';
    linkModal.classList.add('show');
  }

  linkOk.addEventListener('click', function() {
    if (currentLink) {
      currentLink.setAttribute('href', linkHref.value);
      currentLink.textContent = linkText.value;
    }
    closeLinkModal();
  });

  linkCancel.addEventListener('click', closeLinkModal);
  linkModal.addEventListener('click', function(e) { if (e.target === linkModal) closeLinkModal(); });
  function closeLinkModal() { linkModal.classList.remove('show'); currentLink = null; }

  // === 保存 ===
  saveBtn.addEventListener('click', function() {
    disableEditing();
    editing = false;

    const root = document.getElementById('lp-editor-root');
    const styles = document.getElementById('lp-editor-styles');
    root.style.display = 'none';

    const scripts = document.querySelectorAll('script');
    let editorScript = null;
    scripts.forEach(s => {
      if (s.src && s.src.includes('lp-editor')) editorScript = s;
    });
    if (editorScript) editorScript.remove();

    const html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;

    root.style.display = '';
    if (editorScript) document.body.appendChild(editorScript);
    if (styles) document.head.appendChild(styles);

    const filename = document.title.replace(/[/\\?%*:|"<>]/g, '') || 'page';
    const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename + '.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('✅ 保存完了！ ダウンロードフォルダを確認');
  });

  // === トースト ===
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.remove('show'), 2500);
  }

  // === マウス追跡（ペースト用） ===
  document.addEventListener('mouseover', function(e) {
    const wrap = e.target.closest('.lpe-img-wrap');
    if (wrap) lastHoveredImg = wrap.querySelector('img');
  });

  } // initEditor() 終了

})();
