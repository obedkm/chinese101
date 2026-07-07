// DeepSeek client — browser fetch, with a native-HTTP fallback inside the APK
// (WebView pages served from file:// can hit CORS walls; MJBridge.aiRequest bypasses them).
window.AI = (() => {
  const key = () => (Store.data.settings.deepseekKey || '').trim();
  const ready = () => key().length > 10;

  let reqId = 0;
  const pending = {};
  window._mjOnAI = (id, status, text) => {
    const p = pending[id];
    if (!p) return;
    delete pending[id];
    if (status >= 200 && status < 300) p.resolve(text);
    else p.reject(new Error('DeepSeek error ' + status + ': ' + String(text).slice(0, 180)));
  };

  async function chat(messages, opts = {}) {
    if (!ready()) throw new Error('No DeepSeek API key — add one in Settings');
    const body = JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature: opts.temperature ?? 0.6,
      max_tokens: opts.maxTokens ?? 1200,
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
    });
    let raw;
    if (window.MJBridge && MJBridge.aiRequest) {
      raw = await new Promise((resolve, reject) => {
        const id = 'ai' + (++reqId);
        pending[id] = { resolve, reject };
        MJBridge.aiRequest(id, 'https://api.deepseek.com/chat/completions', key(), body);
      });
    } else {
      const res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key() },
        body,
      });
      if (!res.ok) throw new Error('DeepSeek error ' + res.status + ': ' + (await res.text()).slice(0, 180));
      raw = await res.text();
    }
    const data = JSON.parse(raw);
    const msg = data.choices && data.choices[0] && data.choices[0].message;
    if (!msg || !msg.content) throw new Error('DeepSeek returned an empty response');
    return msg.content;
  }

  return { ready, chat };
})();
