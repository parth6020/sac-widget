(function () {
  const PROXY_URL = 'https://sac-ai-proxy.onrender.com/ai-insight';

  const tmpl = document.createElement('template');
  tmpl.innerHTML = `
    <style>
      :host { display: block; font-family: '72', Arial, sans-serif; height: 100%; }
      .wrap { display:flex; flex-direction:column; height:100%; padding:12px; box-sizing:border-box; }
      .title { font-weight:600; margin-bottom:8px; color:#32363a; }
      .msgs { flex:1; overflow-y:auto; border:1px solid #e5e5e5; padding:10px; background:#fafafa; border-radius:4px; min-height:200px; }
      .msg { margin-bottom:10px; line-height:1.4; }
      .msg.user { color:#0a6ed1; font-weight:500; }
      .msg.ai { color:#32363a; white-space:pre-wrap; }
      .row { display:flex; margin-top:8px; gap:6px; }
      input { flex:1; padding:8px; border:1px solid #ccc; border-radius:4px; font-family:inherit; }
      button { padding:8px 14px; background:#0a6ed1; color:#fff; border:0; border-radius:4px; cursor:pointer; }
      button:disabled { background:#aaa; cursor:wait; }
      button.dbg { background:#666; }
      .hint { font-size:11px; color:#888; margin-top:4px; }
    </style>
    <div class="wrap">
      <div class="title">💡 Ask AI about this dashboard</div>
      <div class="msgs" id="msgs"></div>
      <div class="row">
        <input id="q" placeholder="e.g. What's the trend in this data?" />
        <button id="send">Ask</button>
        <button id="dbg" class="dbg">🔍</button>
      </div>
      <div class="hint">v5 — Powered by Llama 3.3 via Groq</div>
    </div>
  `;

  class IOCFOAIChat5 extends HTMLElement {
    constructor() {
      super();
      this._shadow = this.attachShadow({ mode: 'open' });
      this._shadow.appendChild(tmpl.content.cloneNode(true));
      this._props = {};
      this._msgs = this._shadow.getElementById('msgs');
      this._input = this._shadow.getElementById('q');
      this._btn = this._shadow.getElementById('send');
      this._dbgBtn = this._shadow.getElementById('dbg');
      this._btn.addEventListener('click', () => this._ask());
      this._dbgBtn.addEventListener('click', () => this._debug());
      this._input.addEventListener('keydown', e => { if (e.key === 'Enter') this._ask(); });
    }

    // Standard SAC data binding setter
    set myDataBinding(value) { this._props.myDataBinding = value; }
    get myDataBinding() { return this._props.myDataBinding; }

    onCustomWidgetBeforeUpdate(changedProps) {
      this._props = { ...this._props, ...changedProps };
    }
    onCustomWidgetAfterUpdate(changedProps) {
      this._props = { ...this._props, ...changedProps };
    }
    onCustomWidgetResize() {}

    // Extract data — try EVERY possible SAC API method
    _getData() {
      const debug = { attempts: [] };

      // Attempt 1: myDataBinding property (newest SAC versions)
      try {
        const b = this._props.myDataBinding;
        if (b && b.data && b.data.length > 0) {
          debug.attempts.push({ method: 'props.myDataBinding.data', success: true, rows: b.data.length });
          return { rows: this._normalizeRows(b.data), debug };
        }
        debug.attempts.push({ method: 'props.myDataBinding', state: b?.state, hasData: !!b?.data });
      } catch (e) {
        debug.attempts.push({ method: 'props.myDataBinding', error: e.message });
      }

      // Attempt 2: this.dataBindings.getDataBinding (older API)
      try {
        if (this.dataBindings) {
          const b = this.dataBindings.getDataBinding('myDataBinding');
          if (b && b.data && b.data.length > 0) {
            debug.attempts.push({ method: 'dataBindings.getDataBinding', success: true, rows: b.data.length });
            return { rows: this._normalizeRows(b.data), debug };
          }
          debug.attempts.push({ method: 'dataBindings.getDataBinding', state: b?.state, hasData: !!b?.data });
        }
      } catch (e) {
        debug.attempts.push({ method: 'dataBindings.getDataBinding', error: e.message });
      }

      // Attempt 3: getResultSet (production SAC)
      try {
        if (this.dataBindings) {
          const b = this.dataBindings.getDataBinding('myDataBinding');
          if (b && typeof b.getResultSet === 'function') {
            const rs = b.getResultSet();
            if (rs && rs.length > 0) {
              debug.attempts.push({ method: 'getResultSet', success: true, rows: rs.length });
              return { rows: this._normalizeRows(rs), debug };
            }
          }
        }
      } catch (e) {
        debug.attempts.push({ method: 'getResultSet', error: e.message });
      }

      // Attempt 4: Look at ALL properties on `this` and find data
      try {
        const keys = Object.keys(this);
        debug.thisKeys = keys.filter(k => !k.startsWith('_'));
      } catch (e) {}

      debug.allFailed = true;
      return { rows: [], debug };
    }

    _normalizeRows(rawData) {
      return rawData.map(row => {
        const out = {};
        for (const k in row) {
          const c = row[k];
          if (c && typeof c === 'object') {
            out[k] = c.label !== undefined ? c.label :
                     c.formattedValue !== undefined ? c.formattedValue :
                     c.raw !== undefined ? c.raw :
                     c.id !== undefined ? c.id : JSON.stringify(c);
          } else {
            out[k] = c;
          }
        }
        return out;
      });
    }

    _append(role, text) {
      const div = document.createElement('div');
      div.className = 'msg ' + role;
      div.textContent = (role === 'user' ? '👤 ' : '🤖 ') + text;
      this._msgs.appendChild(div);
      this._msgs.scrollTop = this._msgs.scrollHeight;
      return div;
    }

    _debug() {
      const { rows, debug } = this._getData();
      this._append('ai', '🔍 DEBUG OUTPUT:\n\n' + JSON.stringify(debug, null, 2) + '\n\nFirst row:\n' + JSON.stringify(rows[0] || 'NONE', null, 2));
    }

    async _ask() {
      const q = this._input.value.trim();
      if (!q) return;
      this._append('user', q);
      this._input.value = '';
      this._btn.disabled = true;
      const thinking = this._append('ai', 'Thinking…');
      try {
        const { rows } = this._getData();
        const res = await fetch(PROXY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dashboardData: rows, userQuestion: q })
        });
        const json = await res.json();
        thinking.textContent = '🤖 ' + (json.insight || json.error || 'No response');
      } catch (err) {
        thinking.textContent = '🤖 Error: ' + err.message;
      } finally {
        this._btn.disabled = false;
      }
    }
  }

  customElements.define('iocfo-aichat5', IOCFOAIChat5);
})();
