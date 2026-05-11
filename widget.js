// widget.js — SAC Custom Widget: AI Insight Chat
// Loaded by SAC inside an isolated web component. Uses Shadow DOM for style isolation.

(function () {
  const tmpl = document.createElement('template');
  tmpl.innerHTML = `
    <style>
      :host { display: block; font-family: '72', Arial, sans-serif; height: 100%; }
      .wrap { display:flex; flex-direction:column; height:100%; padding:12px; box-sizing:border-box; }
      .title { font-weight:600; margin-bottom:8px; color:#32363a; }
      .msgs { flex:1; overflow-y:auto; border:1px solid #e5e5e5; padding:10px; background:#fafafa; border-radius:4px; }
      .msg { margin-bottom:10px; line-height:1.4; }
      .msg.user { color:#0a6ed1; }
      .msg.ai { color:#32363a; white-space:pre-wrap; }
      .row { display:flex; margin-top:8px; gap:6px; }
      input { flex:1; padding:8px; border:1px solid #ccc; border-radius:4px; }
      button { padding:8px 14px; background:#0a6ed1; color:#fff; border:0; border-radius:4px; cursor:pointer; }
      button:disabled { background:#aaa; cursor:wait; }
      .hint { font-size:11px; color:#888; margin-top:4px; }
    </style>
    <div class="wrap">
      <div class="title">💡 Ask AI about this dashboard</div>
      <div class="msgs" id="msgs"></div>
      <div class="row">
        <input id="q" placeholder="e.g. Which region underperformed last quarter?" />
        <button id="send">Ask</button>
      </div>
      <div class="hint" id="hint">Powered by Claude — responses use the data currently shown</div>
    </div>
  `;

  class AIChatWidget extends HTMLElement {
    constructor() {
      super();
      this._shadow = this.attachShadow({ mode: 'open' });
      this._shadow.appendChild(tmpl.content.cloneNode(true));
      this._proxyUrl = '';
      this._provider = 'claude';

      this._msgs = this._shadow.getElementById('msgs');
      this._input = this._shadow.getElementById('q');
      this._btn = this._shadow.getElementById('send');

      this._btn.addEventListener('click', () => this._ask());
      this._input.addEventListener('keydown', e => { if (e.key === 'Enter') this._ask(); });
    }

    // SAC calls this when properties change in the Builder Panel
    onCustomWidgetBeforeUpdate(changedProps) {
      if ('proxyUrl' in changedProps) this._proxyUrl = changedProps.proxyUrl;
      if ('provider' in changedProps) this._provider = changedProps.provider;
    }

    // Pull data from SAC data binding
    _extractData() {
      try {
        const binding = this.dataBindings && this.dataBindings.getDataBinding('myDataBinding');
        if (!binding || binding.state !== 'success') return [];
        const data = binding.data || [];
        // Compact each row → { dim: label, value: number }
        return data.slice(0, 200).map(row => {
          const out = {};
          for (const key in row) {
            const cell = row[key];
            out[key] = (cell && (cell.label !== undefined ? cell.label : cell.raw)) ?? cell;
          }
          return out;
        });
      } catch (e) {
        console.warn('Data extraction failed:', e);
        return [];
      }
    }

    _append(role, text) {
      const div = document.createElement('div');
      div.className = 'msg ' + role;
      div.textContent = (role === 'user' ? '👤 ' : '🤖 ') + text;
      this._msgs.appendChild(div);
      this._msgs.scrollTop = this._msgs.scrollHeight;
    }

    async _ask() {
      const q = this._input.value.trim();
      if (!q) return;
      if (!this._proxyUrl) { this._append('ai', 'Configure proxyUrl in Builder Panel first.'); return; }

      this._append('user', q);
      this._input.value = '';
      this._btn.disabled = true;
      this._append('ai', 'Thinking…');
      const thinking = this._msgs.lastChild;

      try {
        const dashboardData = this._extractData();
        const res = await fetch(this._proxyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dashboardData, userQuestion: q, provider: this._provider })
        });
        const json = await res.json();
        thinking.textContent = '🤖 ' + (json.insight || json.error || 'No response');

        // Notify SAC scripting (optional)
        this.dispatchEvent(new Event('onInsightReceived'));
      } catch (err) {
        thinking.textContent = '🤖 Error: ' + err.message;
      } finally {
        this._btn.disabled = false;
      }
    }
  }

  customElements.define('ai-chat-widget', AIChatWidget);
})();
