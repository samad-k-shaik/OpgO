/**
 * PDF Report Generator for OP go
 * Uses browser's built-in print-to-PDF (zero dependencies)
 */

type ReportToken = {
  date: string;
  tokenNumber: number;
  patientPhone: string;
  doctorName: string;
  priority: string;
  fee: number;
  status: string;
  bookingType: string;
};

type ReportConfig = {
  hospitalName: string;
  doctorName: string;
  dateRange: string;
  tokens: ReportToken[];
  fees: { normal: number; urgent: number; emergency: number };
};

export function generateReport(config: ReportConfig) {
  const { hospitalName, doctorName, dateRange, tokens, fees } = config;

  const totalPatients = tokens.length;
  const completed = tokens.filter(t => t.status === 'COMPLETED');
  const normalCount = completed.filter(t => t.priority === 'NORMAL' || !t.priority).length;
  const urgentCount = completed.filter(t => t.priority === 'URGENT').length;
  const emergencyCount = completed.filter(t => t.priority === 'EMERGENCY').length;
  const totalRevenue = normalCount * fees.normal + urgentCount * fees.urgent + emergencyCount * fees.emergency;

  const rows = tokens.map(t => `
    <tr>
      <td>${t.date}</td>
      <td>#${t.tokenNumber}</td>
      <td>${t.patientPhone}</td>
      <td>${t.doctorName}</td>
      <td><span class="priority-${(t.priority || 'NORMAL').toLowerCase()}">${t.priority || 'NORMAL'}</span></td>
      <td>₹${t.fee}</td>
      <td>${t.status}</td>
      <td>${t.bookingType === 'REMOTE' ? 'Online' : 'Walk-in'}</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>OP go Report — ${doctorName} — ${dateRange}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', system-ui, sans-serif; padding: 30px; color: #111827; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; border-bottom: 3px solid #111827; padding-bottom: 16px; }
        .header h1 { font-size: 24px; }
        .header .meta { text-align: right; font-size: 12px; color: #6b7280; }
        .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
        .summary-card { text-align: center; padding: 16px; border: 1px solid #e5e7eb; border-radius: 10px; }
        .summary-card .value { font-size: 28px; font-weight: 800; }
        .summary-card .label { font-size: 11px; color: #6b7280; margin-top: 4px; }
        .breakdown { margin-bottom: 24px; padding: 16px; background: #f9fafb; border-radius: 10px; }
        .breakdown h3 { font-size: 14px; margin-bottom: 8px; }
        .breakdown-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { background: #111827; color: #fff; padding: 10px 8px; text-align: left; }
        td { padding: 8px; border-bottom: 1px solid #e5e7eb; }
        tr:nth-child(even) { background: #f9fafb; }
        .priority-normal { color: #6b7280; }
        .priority-urgent { color: #f59e0b; font-weight: 700; }
        .priority-emergency { color: #ef4444; font-weight: 700; }
        .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 12px; }
        @media print { body { padding: 10px; } .no-print { display: none; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1>OP go — Patient Report</h1>
          <div style="font-size:14px;color:#374151;margin-top:4px">${hospitalName}</div>
        </div>
        <div class="meta">
          <div><strong>Doctor:</strong> Dr. ${doctorName}</div>
          <div><strong>Period:</strong> ${dateRange}</div>
          <div><strong>Generated:</strong> ${new Date().toLocaleString('en-IN')}</div>
        </div>
      </div>

      <div class="summary">
        <div class="summary-card">
          <div class="value">${totalPatients}</div>
          <div class="label">Total Patients</div>
        </div>
        <div class="summary-card">
          <div class="value">${completed.length}</div>
          <div class="label">Completed</div>
        </div>
        <div class="summary-card">
          <div class="value" style="color:#059669">₹${totalRevenue.toLocaleString('en-IN')}</div>
          <div class="label">Total Revenue</div>
        </div>
        <div class="summary-card">
          <div class="value">${tokens.filter(t => t.bookingType === 'REMOTE').length}</div>
          <div class="label">Online Bookings</div>
        </div>
      </div>

      <div class="breakdown">
        <h3>💰 Revenue Breakdown</h3>
        <div class="breakdown-row"><span>Normal (${normalCount} × ₹${fees.normal})</span><span>₹${(normalCount * fees.normal).toLocaleString('en-IN')}</span></div>
        <div class="breakdown-row"><span>Urgent (${urgentCount} × ₹${fees.urgent})</span><span>₹${(urgentCount * fees.urgent).toLocaleString('en-IN')}</span></div>
        <div class="breakdown-row"><span>Emergency (${emergencyCount} × ₹${fees.emergency})</span><span>₹${(emergencyCount * fees.emergency).toLocaleString('en-IN')}</span></div>
        <div class="breakdown-row" style="font-weight:800;border-top:1px solid #d1d5db;padding-top:8px;margin-top:4px"><span>Total</span><span>₹${totalRevenue.toLocaleString('en-IN')}</span></div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Token</th>
            <th>Patient</th>
            <th>Doctor</th>
            <th>Priority</th>
            <th>Fee</th>
            <th>Status</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="8" style="text-align:center;padding:20px">No records found.</td></tr>'}
        </tbody>
      </table>

      <div class="footer">
        Generated by OP go Platform • ${new Date().toLocaleDateString('en-IN')}
      </div>

      <div class="no-print" style="text-align:center;margin-top:20px">
        <button onclick="window.print()" style="padding:12px 24px;background:#111827;color:#fff;border:none;border-radius:10px;font-size:14px;cursor:pointer">
          🖨️ Print / Save as PDF
        </button>
      </div>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
  }
}
