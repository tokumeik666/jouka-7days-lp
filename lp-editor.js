/**
 * LP Visual Editor v3.0
 * どのHTMLにも1行追加するだけでnote風ビジュアル編集モードを追加
 *
 * 使い方: HTMLの</body>直前に以下を追加
 * <script src="lp-editor.js"></script>
 *
 * 起動方法:
 *  1. ページ最下部の🔒欄にパスワード「edit」を入力してEnter
 *  2. URLに ?edit を付ける
 *  3. Ctrl+Shift+E (Mac: ⌘+Shift+E)
 * ※ 一般訪問者には編集UIは見えません（🔒欄は極薄表示）
 *
 * 機能:
 *  ✏️ ボタンで編集モードON/OFF
 *  テキストをクリックして直接編集
 *  🎨 文字色変更（選択範囲を保持して色適用）
 *  画像クリックで差し替え（URL / ファイル選択 / ドラッグ&ドロップ / ペースト）
 *  🖼 新しい画像を追加
 *  画像ワンクリック削除（✕ボタン）
 *  リンクのhref+テキスト編集
 *  💾 ボタンでHTMLをダウンロード保存
 *  🚀 GitHubに直接保存・公開
 */
(function() {
  'use strict';

  const EDIT_PASSWORD = 'edit';
  let editorReady = false;

  function boot() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run);
    } else {
      run();
    }
  }

  function run() {
    createPasswordField();
    if (location.search.includes('edit')) {
      editorReady = true;
      initEditor();
    }
  }

  function createPasswordField() {
    const bar = document.createElement('div');
    bar.id = 'lpe-pw-bar';
    bar.style.cssText = 'text-align:center;padding:18px 12px;opacity:0.25;transition:opacity 0.3s;';
    bar.addEventListener('mouseenter', () => bar.style.opacity = '0.6');
    bar.addEventListener('mouseleave', () => { if (!bar.querySelector('input:focus')) bar.style.opacity = '0.25'; });

    const input = document.createElement('input');
    input.type = 'password';
    input.placeholder = '🔒';
    input.autocomplete = 'off';
    input.style.cssText = 'width:120px;padding:6px 12px;border:1px solid rgba(255,255,255,0.15);border-radius:20px;background:rgba(255,255,255,0.05);color:#888;font-size:13px;text-align:center;outline:none;';
    input.addEventListener('focus', () => { bar.style.opacity = '0.8'; input.style.borderColor = 'rgba(255,255,255,0.3)'; });
    input.addEventListener('blur', () => { bar.style.opacity = '0.25'; input.style.borderColor = 'rgba(255,255,255,0.15)'; });
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        if (this.value === EDIT_PASSWORD && !editorReady) {
          editorReady = true;
          bar.remove();
          initEditor();
        } else if (this.value !== EDIT_PASSWORD) {
          input.style.borderColor = '#c45848';
          setTimeout(() => input.style.borderColor = 'rgba(255,255,255,0.15)', 800);
          this.value = '';
        }
      }
    });

    bar.appendChild(input);
    document.body.appendChild(bar);
  }

  boot();

  document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'E' || e.key === 'e')) {
      e.preventDefault();
      if (!editorReady) {
        editorReady = true;
        const pwBar = document.getElementById('lpe-pw-bar');
        if (pwBar) pwBar.remove();
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
    .lpe-btn.lpe-publish {
      background: #2563eb;
      color: #fff;
      display: none;
      font-size: 16px;
    }
    .lpe-btn.lpe-publish.saving {
      opacity: 0.6;
      pointer-events: none;
      animation: lpePulse 1s ease-in-out infinite;
    }
    @keyframes lpePulse {
      0%,100% { transform: scale(1); }
      50% { transform: scale(0.9); }
    }
    .lpe-btn.lpe-color {
      background: #e67e22;
      color: #fff;
      display: none;
      font-size: 16px;
    }
    .lpe-btn.lpe-addimg {
      background: #0ea5e9;
      color: #fff;
      display: none;
      font-size: 16px;
    }
    .lpe-btn.lpe-addvideo {
      background: #ef4444;
      color: #fff;
      display: none;
      font-size: 16px;
    }

    /* 動画追加プレースホルダー */
    body.lpe-editing .lpe-add-video-placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      margin: 12px 0;
      border: 2px dashed rgba(239, 68, 68, 0.3);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      color: rgba(239, 68, 68, 0.6);
      font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', sans-serif;
    }
    body.lpe-editing .lpe-add-video-placeholder:hover {
      border-color: #ef4444;
      background: rgba(239, 68, 68, 0.05);
      color: #ef4444;
    }

    /* 動画ラッパー（レスポンシブ） */
    .lpe-video-container {
      position: relative;
      width: 100%;
      max-width: 600px;
      margin: 32px auto;
      padding-bottom: 56.25%;
      height: 0;
      overflow: hidden;
      border-radius: 2px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.4);
    }
    .lpe-video-container iframe,
    .lpe-video-container video {
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      border: none;
    }

    .lpe-btn.lpe-fontsize {
      background: #8b5cf6;
      color: #fff;
      display: none;
      font-size: 14px;
      font-weight: 700;
    }
    .lpe-size-palette {
      position: fixed;
      bottom: 88px;
      right: 24px;
      background: #1a1a2e;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 10px;
      padding: 12px;
      z-index: 99999;
      display: none;
      box-shadow: 0 8px 30px rgba(0,0,0,0.5);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', sans-serif;
      min-width: 180px;
    }
    .lpe-size-palette.show { display: block; }
    .lpe-size-palette .lpe-palette-label {
      font-size: 11px;
      color: #888;
      margin-bottom: 8px;
    }
    .lpe-size-option {
      display: block;
      width: 100%;
      padding: 6px 12px;
      background: none;
      border: none;
      color: #e0e0e0;
      cursor: pointer;
      text-align: left;
      border-radius: 4px;
      transition: background 0.15s;
      font-family: 'Shippori Mincho', serif;
    }
    .lpe-size-option:hover {
      background: rgba(139, 92, 246, 0.15);
    }
    .lpe-size-custom {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid rgba(255,255,255,0.08);
    }
    .lpe-size-custom input {
      width: 60px;
      padding: 4px 8px;
      background: #0f0f1a;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 4px;
      color: #e0e0e0;
      font-size: 13px;
      text-align: center;
    }
    .lpe-size-custom input:focus { outline: none; border-color: #8b5cf6; }
    .lpe-size-custom span { font-size: 11px; color: #888; }
    .lpe-size-custom button {
      padding: 4px 10px;
      background: #8b5cf6;
      color: #fff;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
    }
    .lpe-color-palette {
      position: fixed;
      bottom: 88px;
      right: 24px;
      background: #1a1a2e;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 10px;
      padding: 12px;
      z-index: 99999;
      display: none;
      box-shadow: 0 8px 30px rgba(0,0,0,0.5);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', sans-serif;
    }
    .lpe-color-palette.show { display: block; }
    .lpe-color-palette .lpe-palette-label {
      font-size: 11px;
      color: #888;
      margin-bottom: 8px;
    }
    .lpe-color-palette .lpe-palette-row {
      display: flex;
      gap: 6px;
      margin-bottom: 8px;
    }
    .lpe-color-swatch {
      width: 28px; height: 28px;
      border-radius: 50%;
      border: 2px solid rgba(255,255,255,0.1);
      cursor: pointer;
      transition: all 0.15s;
    }
    .lpe-color-swatch:hover {
      transform: scale(1.2);
      border-color: #fff;
    }
    .lpe-color-custom {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 4px;
    }
    .lpe-color-custom input[type="color"] {
      width: 28px; height: 28px;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      background: none;
      padding: 0;
    }
    .lpe-color-custom span {
      font-size: 11px;
      color: #888;
    }
    .lpe-color-reset {
      font-size: 11px;
      color: #5a9bb5;
      cursor: pointer;
      background: none;
      border: none;
      padding: 4px 0;
      margin-top: 4px;
    }
    .lpe-color-reset:hover { text-decoration: underline; }

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

    /* テキスト追加ボタン */
    .lpe-btn.lpe-addtext {
      background: #f59e0b;
      color: #fff;
      display: none;
      font-size: 14px;
      font-weight: 700;
    }

    /* テキスト種類セレクタ */
    .lpe-text-type-selector {
      position: fixed;
      background: #1a1a2e;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 10px;
      padding: 8px;
      z-index: 100001;
      display: none;
      box-shadow: 0 8px 30px rgba(0,0,0,0.5);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', sans-serif;
      min-width: 160px;
    }
    .lpe-text-type-selector.show { display: block; }
    .lpe-text-type-option {
      display: block;
      width: 100%;
      padding: 8px 14px;
      background: none;
      border: none;
      color: #e0e0e0;
      cursor: pointer;
      text-align: left;
      border-radius: 6px;
      transition: background 0.15s;
      font-size: 13px;
    }
    .lpe-text-type-option:hover {
      background: rgba(245, 158, 11, 0.15);
    }
    .lpe-text-type-option .lpe-type-label {
      font-weight: 600;
    }
    .lpe-text-type-option .lpe-type-desc {
      font-size: 11px;
      color: #888;
      margin-left: 8px;
    }

    /* テキスト追加プレースホルダー */
    body.lpe-editing .lpe-add-text-placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 14px;
      margin: 8px 0;
      border: 2px dashed rgba(245, 158, 11, 0.3);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      color: rgba(245, 158, 11, 0.6);
      font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', sans-serif;
    }
    body.lpe-editing .lpe-add-text-placeholder:hover {
      border-color: #f59e0b;
      background: rgba(245, 158, 11, 0.05);
      color: #f59e0b;
    }

    /* ブロック削除ボタン */
    body.lpe-editing .lpe-block-del {
      position: absolute;
      top: -8px; right: -8px;
      width: 22px; height: 22px;
      background: #dc2626;
      color: #fff;
      border: 2px solid rgba(255,255,255,0.7);
      border-radius: 50%;
      cursor: pointer;
      font-size: 11px;
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 10;
      line-height: 1;
      padding: 0;
      font-family: -apple-system, sans-serif;
      transition: transform 0.15s;
    }
    body.lpe-editing .lpe-block-wrap:hover .lpe-block-del {
      display: flex;
    }
    body.lpe-editing .lpe-block-del:hover {
      background: #ef4444;
      transform: scale(1.2);
    }
    body.lpe-editing .lpe-block-wrap {
      position: relative;
    }

    /* 空ブロック可視化 */
    body.lpe-editing .lpe-empty-block {
      outline: 2px dashed rgba(220, 38, 38, 0.4) !important;
      outline-offset: 2px !important;
      min-height: 30px;
    }
    body.lpe-editing .lpe-empty-block::after {
      content: '空のブロック — 🗑で削除';
      display: block;
      text-align: center;
      color: rgba(220, 38, 38, 0.5);
      font-size: 11px;
      padding: 6px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', sans-serif;
    }

    /* 画像追加プレースホルダー */
    body.lpe-editing .lpe-add-img-placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      margin: 12px 0;
      border: 2px dashed rgba(14, 165, 233, 0.3);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      color: rgba(14, 165, 233, 0.6);
      font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', sans-serif;
    }
    body.lpe-editing .lpe-add-img-placeholder:hover {
      border-color: #0ea5e9;
      background: rgba(14, 165, 233, 0.05);
      color: #0ea5e9;
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
        <h3 id="lpeImgModalTitle">画像を変更</h3>
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
    <div class="lpe-overlay" id="lpeVideoModal">
      <div class="lpe-modal">
        <h3>動画を追加</h3>
        <p class="lpe-modal-desc">YouTube / Vimeo のURLを貼り付け、または動画ファイルURL</p>
        <input type="text" id="lpeVideoUrl" placeholder="https://www.youtube.com/watch?v=... または動画URL">
        <div id="lpeVideoPreviewWrap" style="margin:12px 0;display:none;">
          <div id="lpeVideoPreview" style="position:relative;width:100%;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:6px;border:1px solid rgba(255,255,255,0.08);"></div>
        </div>
        <div class="lpe-modal-btns">
          <button class="lpe-modal-btn cancel" id="lpeVideoCancel">キャンセル</button>
          <button class="lpe-modal-btn ok" id="lpeVideoOk">追加する</button>
        </div>
      </div>
    </div>
    <div class="lpe-page-dropzone" id="lpePageDrop">
      <div class="lpe-page-dropzone-text">📁 画像をドロップして差し替え</div>
    </div>
    <div class="lpe-notice" id="lpeNotice">
      ✏️ 編集モード — テキスト直接編集 / 🎨文字色 / 🖼画像追加 / 画像クリックで差替え
      <span class="lpe-sub">🚀公開保存 / 📥ダウンロード</span>
    </div>
    <div class="lpe-color-palette" id="lpeColorPalette">
      <div class="lpe-palette-label">テーマカラー</div>
      <div class="lpe-palette-row">
        <div class="lpe-color-swatch" data-color="#5a9bb5" style="background:#5a9bb5" title="水"></div>
        <div class="lpe-color-swatch" data-color="#7ec4d8" style="background:#7ec4d8" title="水(淡)"></div>
        <div class="lpe-color-swatch" data-color="#c45848" style="background:#c45848" title="朱"></div>
        <div class="lpe-color-swatch" data-color="#e8e2d6" style="background:#e8e2d6" title="月"></div>
        <div class="lpe-color-swatch" data-color="#8b7eb8" style="background:#8b7eb8" title="藤"></div>
        <div class="lpe-color-swatch" data-color="#a0aec0" style="background:#a0aec0" title="銀"></div>
      </div>
      <div class="lpe-palette-label">汎用カラー</div>
      <div class="lpe-palette-row">
        <div class="lpe-color-swatch" data-color="#ffffff" style="background:#ffffff" title="白"></div>
        <div class="lpe-color-swatch" data-color="#f59e0b" style="background:#f59e0b" title="金"></div>
        <div class="lpe-color-swatch" data-color="#ef4444" style="background:#ef4444" title="赤"></div>
        <div class="lpe-color-swatch" data-color="#22c55e" style="background:#22c55e" title="緑"></div>
        <div class="lpe-color-swatch" data-color="#3b82f6" style="background:#3b82f6" title="青"></div>
        <div class="lpe-color-swatch" data-color="#ec4899" style="background:#ec4899" title="桃"></div>
      </div>
      <div class="lpe-color-custom">
        <input type="color" id="lpeCustomColor" value="#5a9bb5">
        <span>カスタム色</span>
      </div>
      <button class="lpe-color-reset" id="lpeColorReset">色をリセット</button>
    </div>
    <div class="lpe-size-palette" id="lpeSizePalette">
      <div class="lpe-palette-label">文字サイズ</div>
      <button class="lpe-size-option" data-size="0.75rem" style="font-size:0.75rem">小 (0.75rem)</button>
      <button class="lpe-size-option" data-size="0.85rem" style="font-size:0.85rem">やや小 (0.85rem)</button>
      <button class="lpe-size-option" data-size="0.95rem" style="font-size:0.95rem">標準 (0.95rem)</button>
      <button class="lpe-size-option" data-size="1.1rem" style="font-size:1.1rem">やや大 (1.1rem)</button>
      <button class="lpe-size-option" data-size="1.3rem" style="font-size:1.3rem">大 (1.3rem)</button>
      <button class="lpe-size-option" data-size="1.6rem" style="font-size:1.6rem">特大 (1.6rem)</button>
      <button class="lpe-size-option" data-size="2rem" style="font-size:2rem">見出し (2rem)</button>
      <div class="lpe-size-custom">
        <input type="number" id="lpeSizeCustom" min="8" max="80" value="16" step="1">
        <span>px</span>
        <button id="lpeSizeApply">適用</button>
      </div>
    </div>
    <div class="lpe-text-type-selector" id="lpeTextTypeSelector">
      <button class="lpe-text-type-option" data-type="p"><span class="lpe-type-label">段落</span><span class="lpe-type-desc">本文テキスト</span></button>
      <button class="lpe-text-type-option" data-type="h2"><span class="lpe-type-label">見出し（大）</span><span class="lpe-type-desc">セクション見出し</span></button>
      <button class="lpe-text-type-option" data-type="h3"><span class="lpe-type-label">見出し（小）</span><span class="lpe-type-desc">サブ見出し</span></button>
      <button class="lpe-text-type-option" data-type="quote"><span class="lpe-type-label">引用ボックス</span><span class="lpe-type-desc">巻物風ボックス</span></button>
      <button class="lpe-text-type-option" data-type="big-quote"><span class="lpe-type-label">強調引用</span><span class="lpe-type-desc">大きな文字のキャッチ</span></button>
    </div>
    <div class="lpe-toolbar">
      <button class="lpe-btn lpe-addtext" id="lpeAddTextBtn" title="テキストを追加">T+</button>
      <button class="lpe-btn lpe-fontsize" id="lpeFontSizeBtn" title="文字サイズ変更">Aa</button>
      <button class="lpe-btn lpe-addvideo" id="lpeAddVideoBtn" title="動画を追加">🎬</button>
      <button class="lpe-btn lpe-addimg" id="lpeAddImgBtn" title="画像を追加">🖼</button>
      <button class="lpe-btn lpe-color" id="lpeColorBtn" title="文字色を変更">🎨</button>
      <button class="lpe-btn lpe-link" id="lpeLinkBtn" title="リンク編集モード">🔗</button>
      <button class="lpe-btn lpe-save" id="lpeSaveBtn" title="HTMLダウンロード">📥</button>
      <button class="lpe-btn lpe-publish" id="lpePublishBtn" title="GitHubに保存・公開">🚀</button>
      <button class="lpe-btn lpe-toggle" id="lpeToggle" title="編集モード切替">✏️</button>
    </div>
    <div class="lpe-toast" id="lpeToast"></div>
  `;
  document.body.appendChild(wrapper);

  // === 要素取得 ===
  const toggleBtn = document.getElementById('lpeToggle');
  const saveBtn = document.getElementById('lpeSaveBtn');
  const publishBtn = document.getElementById('lpePublishBtn');
  const colorBtn = document.getElementById('lpeColorBtn');
  const colorPalette = document.getElementById('lpeColorPalette');
  const customColor = document.getElementById('lpeCustomColor');
  const colorReset = document.getElementById('lpeColorReset');
  const addImgBtn = document.getElementById('lpeAddImgBtn');
  const addVideoBtn = document.getElementById('lpeAddVideoBtn');
  const videoModal = document.getElementById('lpeVideoModal');
  const videoUrl = document.getElementById('lpeVideoUrl');
  const videoPreviewWrap = document.getElementById('lpeVideoPreviewWrap');
  const videoPreview = document.getElementById('lpeVideoPreview');
  const videoOk = document.getElementById('lpeVideoOk');
  const videoCancel = document.getElementById('lpeVideoCancel');
  const addTextBtn = document.getElementById('lpeAddTextBtn');
  const textTypeSelector = document.getElementById('lpeTextTypeSelector');
  const fontSizeBtn = document.getElementById('lpeFontSizeBtn');
  const sizePalette = document.getElementById('lpeSizePalette');
  const sizeCustomInput = document.getElementById('lpeSizeCustom');
  const sizeApplyBtn = document.getElementById('lpeSizeApply');
  const linkBtn = document.getElementById('lpeLinkBtn');
  const notice = document.getElementById('lpeNotice');
  const imgModal = document.getElementById('lpeImgModal');
  const imgModalTitle = document.getElementById('lpeImgModalTitle');
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
  let savedSelection = null;
  let imgInsertMode = false;     // true = 新規追加モード, false = 差し替えモード
  let imgInsertTarget = null;    // 新規画像の挿入先要素

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
    publishBtn.style.display = 'flex';
    colorBtn.style.display = 'flex';
    fontSizeBtn.style.display = 'flex';
    addTextBtn.style.display = 'flex';
    addVideoBtn.style.display = 'flex';
    addImgBtn.style.display = 'flex';
    linkBtn.style.display = 'flex';
    notice.style.display = 'block';

    // テキスト編集可能に
    document.querySelectorAll(TEXT_SELECTOR).forEach(el => {
      if (isEditorEl(el)) return;
      if (el.querySelector('h1,h2,h3,h4,h5,h6,p,ul,ol,div,blockquote')) return;
      el.contentEditable = true;
      el.classList.add('lpe-editable');
    });

    // ブロック要素に削除ボタンを追加 + 空ブロック検出
    addBlockDeleteButtons();
    detectEmptyBlocks();

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

    // ページ全体ドラッグ&ドロップ
    document.addEventListener('dragenter', onPageDragEnter, true);
    document.addEventListener('dragover', onPageDragOver, true);
    document.addEventListener('dragleave', onPageDragLeave, true);
    document.addEventListener('drop', onPageDrop, true);

    // ペースト（Ctrl+V）で画像挿入
    document.addEventListener('paste', onPaste, true);
  }

  // === 画像ラッパー作成（修正版：block/inline-blockを正しく判定） ===
  function wrapImage(img) {
    const wrap = document.createElement('div');
    wrap.className = 'lpe-img-wrap';

    // 画像の表示スタイルを継承
    const computed = window.getComputedStyle(img);
    const isBlock = computed.display === 'block';
    wrap.style.display = isBlock ? 'block' : 'inline-block';
    // 幅・最大幅・マージンを継承（CSSクラスの値をコピー）
    if (isBlock) {
      wrap.style.width = computed.width !== 'auto' ? '100%' : '';
      wrap.style.maxWidth = computed.maxWidth;
      wrap.style.margin = computed.margin;
    } else {
      wrap.style.width = img.style.width || '';
    }

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

    // クリックで画像変更モーダル（イベント委譲で確実にキャッチ）
    function onWrapClick(e) {
      // 削除ボタンクリックは除外
      if (e.target.closest('.lpe-img-del')) return;
      e.preventDefault();
      e.stopPropagation();
      openImgModal(img);
    }
    wrap.addEventListener('click', onWrapClick);
    // モバイル対応: touchendでも発火
    wrap.addEventListener('touchend', function(e) {
      if (e.target.closest('.lpe-img-del')) return;
      e.preventDefault();
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
    publishBtn.style.display = 'none';
    colorBtn.style.display = 'none';
    fontSizeBtn.style.display = 'none';
    addTextBtn.style.display = 'none';
    addVideoBtn.style.display = 'none';
    addImgBtn.style.display = 'none';
    colorPalette.classList.remove('show');
    sizePalette.classList.remove('show');
    textTypeSelector.classList.remove('show');
    linkBtn.style.display = 'none';
    notice.style.display = 'none';
    linkEditing = false;
    linkBtn.style.background = '#7c3aed';

    document.querySelectorAll('.lpe-editable').forEach(el => {
      el.contentEditable = false;
      el.classList.remove('lpe-editable');
    });

    // 画像ラッパーを解除
    document.querySelectorAll('.lpe-img-wrap').forEach(wrap => {
      const img = wrap.querySelector('img');
      if (img) {
        wrap.parentNode.insertBefore(img, wrap);
      }
      wrap.remove();
    });

    // ブロック削除ボタンを解除
    document.querySelectorAll('.lpe-block-wrap').forEach(wrap => {
      const child = wrap.firstElementChild;
      if (child && !child.classList.contains('lpe-block-del')) {
        wrap.parentNode.insertBefore(child, wrap);
      }
      wrap.remove();
    });

    // 空ブロック表示をリセット
    document.querySelectorAll('.lpe-empty-block').forEach(el => el.classList.remove('lpe-empty-block'));

    // プレースホルダーを削除
    document.querySelectorAll('.lpe-add-img-placeholder').forEach(p => p.remove());
    document.querySelectorAll('.lpe-add-text-placeholder').forEach(p => p.remove());
    document.querySelectorAll('.lpe-add-video-placeholder').forEach(p => p.remove());

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

  // === 選択範囲の保存・復元 ===
  function saveSelection() {
    const sel = window.getSelection();
    if (sel.rangeCount > 0 && !sel.isCollapsed) {
      savedSelection = sel.getRangeAt(0).cloneRange();
    }
  }

  function restoreSelection() {
    if (savedSelection) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedSelection);
      return true;
    }
    return false;
  }

  // === 文字色変更 ===
  colorBtn.addEventListener('mousedown', function(e) {
    e.preventDefault();
    saveSelection();
  });
  colorBtn.addEventListener('click', function(e) {
    e.preventDefault();
    colorPalette.classList.toggle('show');
  });

  // パレット自体のmousedownで選択が消えるのを防止
  colorPalette.addEventListener('mousedown', function(e) {
    e.preventDefault();
  });

  // パレットのスウォッチクリック
  colorPalette.querySelectorAll('.lpe-color-swatch').forEach(swatch => {
    swatch.addEventListener('click', function(e) {
      e.preventDefault();
      applyColor(this.dataset.color);
    });
  });

  // カスタムカラーピッカー
  customColor.addEventListener('input', function() {
    restoreSelection();
    applyColor(this.value);
  });

  // 色リセット
  colorReset.addEventListener('click', function(e) {
    e.preventDefault();
    if (!restoreSelection()) {
      showToast('💡 先にテキストを選択してください');
      return;
    }
    document.execCommand('removeFormat', false, null);
    showToast('🎨 色をリセットしました');
    savedSelection = null;
  });

  function applyColor(color) {
    if (!restoreSelection()) {
      showToast('💡 先にテキストを選択してから色を選んでください');
      return;
    }
    document.execCommand('foreColor', false, color);
    colorPalette.classList.remove('show');
    showToast('🎨 文字色を変更しました');
    savedSelection = null;
  }

  // パレット外クリックで閉じる
  document.addEventListener('mousedown', function(e) {
    if (!e.target.closest('.lpe-color-palette') && !e.target.closest('.lpe-color')) {
      colorPalette.classList.remove('show');
    }
    if (!e.target.closest('.lpe-size-palette') && !e.target.closest('.lpe-fontsize')) {
      sizePalette.classList.remove('show');
    }
  });

  // === 文字サイズ変更 ===
  fontSizeBtn.addEventListener('mousedown', function(e) {
    e.preventDefault();
    saveSelection();
  });
  fontSizeBtn.addEventListener('click', function(e) {
    e.preventDefault();
    sizePalette.classList.toggle('show');
    colorPalette.classList.remove('show');
  });

  sizePalette.addEventListener('mousedown', function(e) {
    e.preventDefault();
  });

  sizePalette.querySelectorAll('.lpe-size-option').forEach(opt => {
    opt.addEventListener('click', function(e) {
      e.preventDefault();
      applyFontSize(this.dataset.size);
    });
  });

  sizeApplyBtn.addEventListener('click', function(e) {
    e.preventDefault();
    const px = parseInt(sizeCustomInput.value, 10);
    if (px >= 8 && px <= 80) {
      applyFontSize(px + 'px');
    } else {
      showToast('⚠️ 8〜80pxの範囲で入力してください');
    }
  });

  function applyFontSize(size) {
    if (!restoreSelection()) {
      showToast('💡 先にテキストを選択してからサイズを選んでください');
      return;
    }
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const span = document.createElement('span');
    span.style.fontSize = size;
    range.surroundContents(span);
    sel.removeAllRanges();
    sizePalette.classList.remove('show');
    showToast('📏 文字サイズを ' + size + ' に変更しました');
    savedSelection = null;
  }

  // テキスト選択が変わったら自動保存
  document.addEventListener('selectionchange', function() {
    if (!editing) return;
    const sel = window.getSelection();
    if (sel.rangeCount > 0 && !sel.isCollapsed) {
      const anchor = sel.anchorNode;
      if (anchor && !isEditorEl(anchor.parentElement || anchor)) {
        savedSelection = sel.getRangeAt(0).cloneRange();
      }
    }
  });

  // === ブロック要素に削除ボタンを追加 ===
  const BLOCK_SELECTOR = 'p, h2, h3, h4, .quote, .big-quote, .bt, .compare-box, .faq-item, .sub-ttl, .sec-ttl, .soldout-banner, .guide-step';

  function addBlockDeleteButtons() {
    document.querySelectorAll(BLOCK_SELECTOR).forEach(el => {
      if (isEditorEl(el)) return;
      if (el.closest('.lpe-block-wrap')) return;
      if (el.closest('.lpe-img-wrap')) return;
      if (el.closest('#lp-editor-root')) return;

      const wrap = document.createElement('div');
      wrap.className = 'lpe-block-wrap';

      const delBtn = document.createElement('button');
      delBtn.className = 'lpe-block-del';
      delBtn.textContent = '✕';
      delBtn.title = 'このブロックを削除';
      delBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        wrap.remove();
        showToast('🗑 ブロックを削除しました');
      });

      el.parentNode.insertBefore(wrap, el);
      wrap.appendChild(el);
      wrap.appendChild(delBtn);
    });
  }

  // === 空ブロック検出 ===
  function detectEmptyBlocks() {
    document.querySelectorAll('p, h2, h3, h4, div.quote, div.big-quote, div.bt').forEach(el => {
      if (isEditorEl(el)) return;
      const text = el.textContent.trim();
      const hasImg = el.querySelector('img');
      if (!text && !hasImg) {
        el.classList.add('lpe-empty-block');
      }
    });
  }

  // === テキスト追加モード ===
  let textAddMode = false;
  let textInsertTarget = null;

  addTextBtn.addEventListener('click', function() {
    // プレースホルダーを表示/非表示
    const existing = document.querySelectorAll('.lpe-add-text-placeholder');
    if (existing.length > 0) {
      existing.forEach(p => p.remove());
      addTextBtn.style.background = '#f59e0b';
      textAddMode = false;
      showToast('T+ テキスト追加モードOFF');
      return;
    }

    textAddMode = true;
    addTextBtn.style.background = '#dc2626';
    showToast('T+ 「+テキスト」をクリックして挿入場所を選んでください');

    const containers = document.querySelectorAll('.container, .hero-content');
    const targets = new Set();
    containers.forEach(container => {
      const children = container.children;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (isEditorEl(child)) continue;
        if (child.classList.contains('lpe-add-text-placeholder')) continue;
        if (child.classList.contains('lpe-add-img-placeholder')) continue;
        if (child.tagName === 'SECTION' || child.classList.contains('container')) continue;
        targets.add(child);
      }
    });

    targets.forEach(target => {
      const placeholder = document.createElement('div');
      placeholder.className = 'lpe-add-text-placeholder';
      placeholder.innerHTML = '＋ ここにテキストを追加';
      placeholder.addEventListener('click', function(e) {
        textInsertTarget = target;
        // セレクタをクリック位置の近くに表示
        const rect = placeholder.getBoundingClientRect();
        textTypeSelector.style.left = Math.min(rect.left, window.innerWidth - 200) + 'px';
        textTypeSelector.style.top = (rect.top - 10) + 'px';
        textTypeSelector.style.bottom = 'auto';
        textTypeSelector.classList.add('show');
      });
      target.parentNode.insertBefore(placeholder, target.nextSibling);
    });
  });

  // テキストタイプ選択
  textTypeSelector.querySelectorAll('.lpe-text-type-option').forEach(opt => {
    opt.addEventListener('click', function() {
      if (!textInsertTarget) return;
      const type = this.dataset.type;
      let newEl;

      switch(type) {
        case 'p':
          newEl = document.createElement('p');
          newEl.className = 'bt fi visible';
          newEl.innerHTML = 'ここにテキストを入力...';
          break;
        case 'h2':
          newEl = document.createElement('h2');
          newEl.className = 'sec-ttl fi visible';
          newEl.innerHTML = '見出しテキスト';
          break;
        case 'h3':
          newEl = document.createElement('h3');
          newEl.className = 'sub-ttl fi visible';
          newEl.innerHTML = 'サブ見出しテキスト';
          break;
        case 'quote':
          newEl = document.createElement('div');
          newEl.className = 'quote fi visible';
          newEl.innerHTML = '<p>引用テキストをここに入力...</p>';
          break;
        case 'big-quote':
          newEl = document.createElement('div');
          newEl.className = 'big-quote fi visible';
          newEl.innerHTML = '<strong>強調テキストをここに入力...</strong>';
          break;
      }

      if (newEl) {
        textInsertTarget.parentNode.insertBefore(newEl, textInsertTarget.nextSibling);
        // 編集可能にする
        newEl.contentEditable = true;
        newEl.classList.add('lpe-editable');
        newEl.focus();
        // ブロック削除ボタンを追加
        const wrap = document.createElement('div');
        wrap.className = 'lpe-block-wrap';
        const delBtn = document.createElement('button');
        delBtn.className = 'lpe-block-del';
        delBtn.textContent = '✕';
        delBtn.title = 'このブロックを削除';
        delBtn.addEventListener('click', function(ev) {
          ev.preventDefault();
          ev.stopPropagation();
          wrap.remove();
          showToast('🗑 ブロックを削除しました');
        });
        newEl.parentNode.insertBefore(wrap, newEl);
        wrap.appendChild(newEl);
        wrap.appendChild(delBtn);

        showToast('✅ テキストブロックを追加しました');
      }

      // プレースホルダーを全削除
      document.querySelectorAll('.lpe-add-text-placeholder').forEach(p => p.remove());
      textTypeSelector.classList.remove('show');
      addTextBtn.style.background = '#f59e0b';
      textAddMode = false;
      textInsertTarget = null;
    });
  });

  // セレクタ外クリックで閉じる
  document.addEventListener('mousedown', function(e) {
    if (!e.target.closest('.lpe-text-type-selector') && !e.target.closest('.lpe-add-text-placeholder')) {
      textTypeSelector.classList.remove('show');
    }
  });

  // === 画像追加モード ===
  addImgBtn.addEventListener('click', function() {
    // 画像追加用プレースホルダーを表示/非表示
    const existing = document.querySelectorAll('.lpe-add-img-placeholder');
    if (existing.length > 0) {
      existing.forEach(p => p.remove());
      addImgBtn.style.background = '#0ea5e9';
      showToast('🖼 画像追加モードOFF');
      return;
    }

    addImgBtn.style.background = '#dc2626';
    showToast('🖼 「+画像」をクリックして挿入場所を選んでください');

    // セクション(.container)内の各要素の後に「+画像」プレースホルダーを挿入
    const containers = document.querySelectorAll('.container, .hero-content, section');
    const targets = new Set();
    containers.forEach(container => {
      const children = container.children;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (isEditorEl(child)) continue;
        if (child.classList.contains('lpe-add-img-placeholder')) continue;
        if (child.classList.contains('lpe-img-wrap')) continue;
        // sectionやcontainer自体はスキップ
        if (child.tagName === 'SECTION' || child.classList.contains('container')) continue;
        targets.add(child);
      }
    });

    targets.forEach(target => {
      const placeholder = document.createElement('div');
      placeholder.className = 'lpe-add-img-placeholder';
      placeholder.innerHTML = '＋ ここに画像を追加';
      placeholder.addEventListener('click', function() {
        imgInsertMode = true;
        imgInsertTarget = target;
        openImgModal(null);
      });
      target.parentNode.insertBefore(placeholder, target.nextSibling);
    });
  });

  // === 動画追加モード ===
  let videoInsertTarget = null;

  function parseVideoUrl(url) {
    // YouTube
    let m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
    if (m) return { type: 'youtube', id: m[1] };
    // Vimeo
    m = url.match(/vimeo\.com\/(\d+)/);
    if (m) return { type: 'vimeo', id: m[1] };
    // 直接URL（mp4等）
    if (url.match(/\.(mp4|webm|ogg)(\?|$)/i)) return { type: 'file', url: url };
    // その他のURLはiframeで試行
    if (url.startsWith('http')) return { type: 'iframe', url: url };
    return null;
  }

  function createVideoEmbed(info) {
    const container = document.createElement('div');
    container.className = 'lpe-video-container';

    if (info.type === 'youtube') {
      const iframe = document.createElement('iframe');
      iframe.src = 'https://www.youtube.com/embed/' + info.id;
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      iframe.allowFullscreen = true;
      container.appendChild(iframe);
    } else if (info.type === 'vimeo') {
      const iframe = document.createElement('iframe');
      iframe.src = 'https://player.vimeo.com/video/' + info.id;
      iframe.allow = 'autoplay; fullscreen; picture-in-picture';
      iframe.allowFullscreen = true;
      container.appendChild(iframe);
    } else if (info.type === 'file') {
      const video = document.createElement('video');
      video.src = info.url;
      video.controls = true;
      video.preload = 'metadata';
      container.appendChild(video);
    } else if (info.type === 'iframe') {
      const iframe = document.createElement('iframe');
      iframe.src = info.url;
      iframe.allowFullscreen = true;
      container.appendChild(iframe);
    }

    return container;
  }

  addVideoBtn.addEventListener('click', function() {
    const existing = document.querySelectorAll('.lpe-add-video-placeholder');
    if (existing.length > 0) {
      existing.forEach(p => p.remove());
      addVideoBtn.style.background = '#ef4444';
      showToast('🎬 動画追加モードOFF');
      return;
    }

    addVideoBtn.style.background = '#dc2626';
    showToast('🎬 「+動画」をクリックして挿入場所を選んでください');

    const containers = document.querySelectorAll('.container, .hero-content');
    const targets = new Set();
    containers.forEach(container => {
      const children = container.children;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (isEditorEl(child)) continue;
        if (child.classList.contains('lpe-add-video-placeholder')) continue;
        if (child.classList.contains('lpe-add-img-placeholder')) continue;
        if (child.classList.contains('lpe-add-text-placeholder')) continue;
        if (child.tagName === 'SECTION' || child.classList.contains('container')) continue;
        targets.add(child);
      }
    });

    targets.forEach(target => {
      const placeholder = document.createElement('div');
      placeholder.className = 'lpe-add-video-placeholder';
      placeholder.innerHTML = '＋ ここに動画を追加';
      placeholder.addEventListener('click', function() {
        videoInsertTarget = target;
        videoUrl.value = '';
        videoPreviewWrap.style.display = 'none';
        videoPreview.innerHTML = '';
        videoModal.classList.add('show');
      });
      target.parentNode.insertBefore(placeholder, target.nextSibling);
    });
  });

  // 動画URLプレビュー
  videoUrl.addEventListener('input', function() {
    const info = parseVideoUrl(this.value.trim());
    if (info) {
      videoPreview.innerHTML = '';
      const embed = createVideoEmbed(info);
      // プレビュー用にスタイル調整
      embed.style.maxWidth = '100%';
      embed.style.margin = '0';
      videoPreview.appendChild(embed.querySelector('iframe, video').cloneNode(true));
      const child = videoPreview.firstChild;
      child.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:none;';
      videoPreviewWrap.style.display = 'block';
    } else {
      videoPreviewWrap.style.display = 'none';
    }
  });

  videoOk.addEventListener('click', function() {
    const url = videoUrl.value.trim();
    if (!url) {
      showToast('⚠️ 動画URLを入力してください');
      return;
    }
    const info = parseVideoUrl(url);
    if (!info) {
      showToast('⚠️ 対応していないURLです');
      return;
    }

    if (videoInsertTarget) {
      const embed = createVideoEmbed(info);
      videoInsertTarget.parentNode.insertBefore(embed, videoInsertTarget.nextSibling);
      showToast('✅ 動画を追加しました');
    }

    document.querySelectorAll('.lpe-add-video-placeholder').forEach(p => p.remove());
    addVideoBtn.style.background = '#ef4444';
    videoModal.classList.remove('show');
    videoInsertTarget = null;
  });

  videoCancel.addEventListener('click', function() {
    videoModal.classList.remove('show');
    videoInsertTarget = null;
  });
  videoModal.addEventListener('click', function(e) {
    if (e.target === videoModal) {
      videoModal.classList.remove('show');
      videoInsertTarget = null;
    }
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
        if (imgModal.classList.contains('show')) {
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

  // === 画像モーダル（差し替え＆新規追加 共用）===
  function openImgModal(img) {
    if (img) {
      // 差し替えモード
      imgInsertMode = false;
      currentImg = img;
      imgModalTitle.textContent = '画像を変更';
      imgOk.textContent = '変更する';
      imgUrl.value = img.src;
      imgPreview.src = img.src;
      imgPreview.style.display = 'block';
    } else {
      // 新規追加モード
      imgInsertMode = true;
      currentImg = null;
      imgModalTitle.textContent = '画像を追加';
      imgOk.textContent = '追加する';
      imgUrl.value = '';
      imgPreview.style.display = 'none';
    }
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
    const url = imgUrl.value;
    if (!url) {
      showToast('⚠️ 画像URLまたはファイルを指定してください');
      return;
    }

    if (imgInsertMode && imgInsertTarget) {
      // 新規画像を追加
      const newImg = document.createElement('img');
      newImg.src = url;
      newImg.alt = '';
      newImg.className = 'full-img';
      newImg.style.cssText = 'width:100%;max-width:600px;display:block;margin:32px auto;border-radius:2px;border:1px solid rgba(255,255,255,0.03);box-shadow:0 8px 40px rgba(0,0,0,0.4),0 0 1px rgba(90,155,181,0.1);';
      // 挿入先の後に追加
      imgInsertTarget.parentNode.insertBefore(newImg, imgInsertTarget.nextSibling);
      // すぐにラップ
      wrapImage(newImg);
      // プレースホルダーを全削除
      document.querySelectorAll('.lpe-add-img-placeholder').forEach(p => p.remove());
      addImgBtn.style.background = '#0ea5e9';
      showToast('✅ 画像を追加しました');
    } else if (currentImg) {
      // 既存画像を差し替え
      currentImg.src = url;
      showToast('✅ 画像を変更しました');
    }

    closeImgModal();
  });

  imgCancel.addEventListener('click', closeImgModal);
  imgModal.addEventListener('click', function(e) { if (e.target === imgModal) closeImgModal(); });
  function closeImgModal() {
    imgModal.classList.remove('show');
    currentImg = null;
    imgInsertMode = false;
    imgInsertTarget = null;
  }

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
    const pwBar = document.getElementById('lpe-pw-bar');
    if (root) root.remove();
    if (styles) styles.remove();
    if (pwBar) pwBar.remove();

    const scripts = document.querySelectorAll('script');
    let editorScript = null;
    scripts.forEach(s => {
      if (s.src && s.src.includes('lp-editor')) editorScript = s;
    });
    if (editorScript) editorScript.remove();

    const html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;

    if (root) document.body.appendChild(root);
    if (editorScript) document.body.appendChild(editorScript);
    if (styles) document.head.appendChild(styles);
    createPasswordField();

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

  // === GitHub に保存・公開 ===
  publishBtn.addEventListener('click', async function() {
    publishBtn.classList.add('saving');
    publishBtn.textContent = '⏳';
    showToast('🚀 GitHubに保存中...');

    try {
      let owner, repo, filePath = 'index.html';
      const hostname = location.hostname;
      if (hostname.endsWith('.github.io')) {
        owner = hostname.replace('.github.io', '');
        const pathParts = location.pathname.split('/').filter(Boolean);
        repo = pathParts[0] || '';
      }
      if (!owner || !repo) {
        const meta = document.querySelector('meta[name="lp-github"]');
        if (meta) {
          const parts = meta.content.split('/');
          owner = parts[0]; repo = parts[1];
        }
      }
      if (!owner || !repo) {
        showToast('⚠️ GitHub情報を検出できません');
        return;
      }

      let token = localStorage.getItem('lpe-github-token');
      if (!token) {
        token = prompt('GitHub Token を入力（初回のみ・ブラウザに保存されます）\n\nターミナルで gh auth token を実行してコピーしてください');
        if (!token) { showToast('❌ キャンセルされました'); return; }
        localStorage.setItem('lpe-github-token', token);
      }

      disableEditing();
      editing = false;

      const root = document.getElementById('lp-editor-root');
      const styles = document.getElementById('lp-editor-styles');
      const pwBar = document.getElementById('lpe-pw-bar');
      if (root) root.remove();
      if (styles) styles.remove();
      if (pwBar) pwBar.remove();

      const cleanHtml = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;

      if (root) document.body.appendChild(root);
      if (styles) document.head.appendChild(styles);
      createPasswordField();

      const apiBase = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + filePath;
      const getRes = await fetch(apiBase, {
        headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' }
      });

      if (getRes.status === 401) {
        localStorage.removeItem('lpe-github-token');
        showToast('❌ トークンが無効です。もう一度🚀を押してください');
        return;
      }
      if (!getRes.ok) throw new Error('ファイル情報の取得に失敗');

      const fileData = await getRes.json();
      const sha = fileData.sha;

      const putRes = await fetch(apiBase, {
        method: 'PUT',
        headers: {
          'Authorization': 'token ' + token,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: 'update: ' + new Date().toLocaleString('ja-JP'),
          content: btoa(unescape(encodeURIComponent(cleanHtml))),
          sha: sha
        })
      });

      if (!putRes.ok) {
        const err = await putRes.json().catch(() => ({}));
        throw new Error(err.message || '保存に失敗');
      }

      showToast('✅ GitHubに保存しました！数秒で公開に反映されます');
    } catch (e) {
      showToast('❌ エラー: ' + e.message);
    } finally {
      publishBtn.classList.remove('saving');
      publishBtn.textContent = '🚀';
    }
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
