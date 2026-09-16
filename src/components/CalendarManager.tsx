import { useState } from 'react';

interface Props {
  serviceId: string;
  initialBlocked: string[];
}

function monthMatrix(year: number, month: number): (string | null)[][] {
  const first = new Date(Date.UTC(year, month, 1));
  const startDay = (first.getUTCDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (string | null)[] = Array(startDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function CalendarManager({ serviceId, initialBlocked }: Props) {
  const [blocked, setBlocked] = useState<Set<string>>(new Set(initialBlocked));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  async function toggle(date: string) {
    if (date < today || busy) return;
    setBusy(date);
    setError('');
    try {
      const res = await fetch('/api/dashboard/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_id: serviceId, date, action: 'toggle_block' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setBlocked((prev) => {
        const next = new Set(prev);
        data.blocked ? next.add(date) : next.delete(date);
        return next;
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-5 text-sm text-navy-600 mb-4">
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded bg-white border border-sand-200 inline-block" /> Open
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded bg-red-200 inline-block" /> Blocked
        </span>
        <span>Click a date to toggle.</span>
      </div>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
        {months.map(({ year, month }) => (
          <div key={`${year}-${month}`} className="rounded-2xl bg-white border border-sand-200 p-4">
            <div className="font-medium text-sm mb-3 text-center">
              {MONTHS[month]} {year}
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-navy-600/70 mb-1">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                <div key={i}>{d}</div>
              ))}
            </div>
            {monthMatrix(year, month).map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-1 mb-1">
                {week.map((date, di) =>
                  date ? (
                    <button
                      key={di}
                      type="button"
                      onClick={() => toggle(date)}
                      disabled={date < today || busy === date}
                      className={[
                        'aspect-square rounded text-xs transition-colors',
                        date < today
                          ? 'text-navy-200 cursor-default'
                          : blocked.has(date)
                            ? 'bg-red-200 text-red-800 hover:bg-red-300'
                            : 'bg-sand-50 hover:bg-gold-300/40 border border-sand-200',
                        busy === date ? 'opacity-40' : '',
                      ].join(' ')}
                    >
                      {Number(date.slice(8))}
                    </button>
                  ) : (
                    <div key={di} />
                  )
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
