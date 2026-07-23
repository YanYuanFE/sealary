// 本机导出 —— CSV 下载 + 打印凭证（浏览器打印面板即可另存 PDF，零依赖）。

// 行数组 → CSV 文本（含引号转义）。
export function csvString(rows: string[][]): string {
  return rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n')
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// 完整性尾行：hash 覆盖其上全部数据行（验证 = 去掉尾行后 sha256 比对），meta 为批次元数据。
export async function csvFooter(body: string, meta: Record<string, string> = {}): Promise<string> {
  const kv = Object.entries(meta).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ')
  return `# sealary-export ${kv}${kv ? ' ' : ''}sha256=${await sha256Hex(body)}`
}

// 生成并下载 CSV，尾行附 SHA-256 + 批次元数据（防篡改的可验证导出）。
export async function downloadCsv(filename: string, rows: string[][], meta: Record<string, string> = {}) {
  const body = csvString(rows)
  const csv = body + '\n' + (await csvFooter(body, { ...meta, rows: String(rows.length - 1), generated: new Date().toISOString() }))
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export type PrintDoc = {
  title: string // 'Payslip' | 'Payroll receipt'
  subtitle: string // 期数等
  amount: string // 主金额行，如 '14,200 zUSD'
  fields: [string, string][]
  footnote: string
}

// ponytail: window.print 代替 PDF 库——样式内联自包含，无新依赖。
// 返回 false = 弹窗被拦（调用方提示放行）。
export function printDocument(doc: PrintDoc): boolean {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const rows = doc.fields
    .map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td class="v">${esc(v)}</td></tr>`)
    .join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(doc.title)} · Sealary</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; color: #2b2622; margin: 0; padding: 48px; }
  .sheet { max-width: 640px; margin: 0 auto; }
  header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #2b2622; padding-bottom: 16px; }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 18px; }
  .stamp { display: inline-grid; place-items: center; width: 34px; height: 34px; border-radius: 50%;
           background: #9a342b; color: #fbf8ef; font-size: 16px; font-weight: 700; }
  .badge { font-family: ui-monospace, monospace; font-size: 11px; letter-spacing: 2px; text-transform: uppercase;
           color: #9a342b; border: 1px solid #9a342b; border-radius: 999px; padding: 4px 12px; }
  h1 { font-size: 28px; margin: 28px 0 2px; }
  .sub { color: #6f675f; font-family: ui-monospace, monospace; font-size: 13px; margin: 0; }
  .amount { font-family: ui-monospace, monospace; font-size: 30px; font-weight: 600; margin: 24px 0;
            padding: 18px 20px; border: 1px solid #d9d2c7; border-radius: 12px; background: #faf6ee; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td { padding: 10px 0; border-bottom: 1px solid #e7e1d6; vertical-align: top; }
  .k { color: #6f675f; font-family: ui-monospace, monospace; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; width: 130px; }
  .v { font-family: ui-monospace, monospace; word-break: break-all; }
  footer { margin-top: 28px; color: #6f675f; font-size: 12px; line-height: 1.6; }
  @media print { body { padding: 24px; } }
</style></head><body><div class="sheet">
  <header>
    <span class="brand"><span class="stamp">S</span> Sealary</span>
    <span class="badge">sealed record</span>
  </header>
  <h1>${esc(doc.title)}</h1>
  <p class="sub">${esc(doc.subtitle)}</p>
  <div class="amount">${esc(doc.amount)}</div>
  <table>${rows}</table>
  <footer>${esc(doc.footnote)}</footer>
</div></body></html>`
  const w = window.open('', '_blank', 'width=760,height=940')
  if (!w) return false
  w.document.write(html)
  w.document.close()
  setTimeout(() => {
    w.focus()
    w.print()
  }, 120)
  return true
}
