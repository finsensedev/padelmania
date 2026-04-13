import { useState } from 'react';
import { Bell, Trash2, Clock, Info, Download, Copy } from 'lucide-react';
import { useActivityFeed } from 'src/contexts/useActivityFeed';
import { useNotificationCenter } from 'src/contexts/NotificationCenterContext';
import type { ActivityItem } from 'src/contexts/internal/ActivityFeedContext';
import useNotification from 'src/hooks/useNotification';

interface DetailState { id: string; }

// NotificationBar: compact activity center for manager - shows recent booking cancellations & maintenance events.
export default function NotificationBar(){
  const { items, clear, unseen, markAllSeen } = useActivityFeed();
  const { counts, reset } = useNotificationCenter();
  const [open,setOpen]=useState(false);
  const [detail,setDetail]=useState<DetailState|undefined>();
  const { toaster } = useNotification();
  return (
    <div className="relative">
  <button onClick={()=> setOpen(o=>{ const next=!o; if(next){ markAllSeen(); } return next; })} className="relative p-2 rounded-md hover:bg-accent transition-colors flex items-center justify-center" aria-label="Notifications">
        <Bell className="w-5 h-5"/>
        {unseen>0 && <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[1rem] px-1 rounded-full bg-red-500 text-[10px] text-white flex items-center justify-center font-semibold">{unseen>9?'9+':unseen}</span>}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[360px] max-h-[75vh] flex flex-col bg-popover border rounded-lg shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
          <div className="flex flex-col border-b bg-muted/40 backdrop-blur supports-[backdrop-filter]:bg-muted/30">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-sm font-semibold" title="Showing only today's events (Africa/Nairobi)">Today • {new Intl.DateTimeFormat('en-CA',{ timeZone:'Africa/Nairobi', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date())} ({items.length})</span>
              <div className="flex items-center gap-2">
                {items.length>0 && (
                  <>
                    <button onClick={()=>exportCSV(items)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1" title="Export CSV"><Download className="w-3 h-3"/>CSV</button>
                    <button onClick={clear} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><Trash2 className="w-3 h-3"/>Clear</button>
                  </>
                )}
              </div>
            </div>
            <div className="px-3 pb-2 flex flex-wrap gap-2 text-[10px]">
              <CategoryBadge label="Verified" count={counts.verifiedUsers} onClear={()=>reset('verifiedUsers')} color="emerald" />
              <CategoryBadge label="Impact" count={counts.maintenanceImpacts} onClear={()=>reset('maintenanceImpacts')} color="rose" />
              <CategoryBadge label="Emails" count={counts.maintenanceEmails} onClear={()=>reset('maintenanceEmails')} color="indigo" />
            </div>
          </div>
          <ul className="flex-1 overflow-y-auto divide-y text-xs">
            {items.length===0 && (
              <li className="p-6 text-muted-foreground text-center">No recent events</li>
            )}
            {items.map(it=>{
              return (
                <li key={it.id} className="p-3 space-y-1 hover:bg-muted/40 group cursor-pointer" onClick={()=>handleItemClick(it, toaster)}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 min-w-0">
                      <Badge type={it.type} />
                      <span className="font-medium truncate" title={labelFor(it.type)}>{labelFor(it.type)}</span>
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <time className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground"><Clock className="w-3 h-3"/>{timeAgo(it.at)}</time>
                      <button onClick={(e)=>{e.stopPropagation(); setDetail({ id: it.id });}} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted" title="Details"><Info className="w-3 h-3"/></button>
                    </div>
                  </div>
                  <p className="leading-snug break-words" title={it.message}>{it.message}</p>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {detail && <DetailModal id={detail.id} onClose={()=>setDetail(undefined)} />}
    </div>
  );
}

function labelFor(t: string){
  if(t==='BOOKING_CANCELLED') return 'Booking Cancelled';
  if(t==='MAINTENANCE_CREATED') return 'Maintenance Added';
  if(t==='MAINTENANCE_CASCADES') return 'Maintenance Impact';
  if(t==='USER_VERIFIED') return 'User Verified';
  if(t==='MAINTENANCE_EMAIL') return 'Maintenance Email';
  return t;
}

function timeAgo(iso: string){
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff/1000);
  if(sec<60) return sec+'s ago';
  const min=Math.floor(sec/60); if(min<60) return min+'m ago';
  const hr=Math.floor(min/60); if(hr<24) return hr+'h ago';
  const d=Math.floor(hr/24); return d+'d ago';
}

function Badge({ type }: { type:string }){
  const base = 'px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide';
  if(type==='BOOKING_CANCELLED') return <span className={base+' bg-red-500/15 text-red-600 dark:text-red-400 dark:bg-red-500/20'}>CANCEL</span>;
  if(type==='MAINTENANCE_CREATED') return <span className={base+' bg-amber-500/15 text-amber-600 dark:text-amber-400 dark:bg-amber-500/20'}>MAINT</span>;
  if(type==='MAINTENANCE_CASCADES') return <span className={base+' bg-rose-500/15 text-rose-600 dark:text-rose-400 dark:bg-rose-500/20'}>IMPACT</span>;
  if(type==='USER_VERIFIED') return <span className={base+' bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 dark:bg-emerald-500/20'}>USER</span>;
  if(type==='MAINTENANCE_EMAIL') return <span className={base+' bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 dark:bg-indigo-500/20'}>EMAIL</span>;
  return <span className={base+' bg-muted text-foreground'}>EVENT</span>;
}

function handleItemClick(it: ActivityItem, toaster: ReturnType<typeof useNotification>['toaster']){
  // If booking cancellation, copy booking code if present
  if(it.type==='BOOKING_CANCELLED' && it.meta?.bookingCode){
    navigator.clipboard.writeText(String(it.meta.bookingCode)).then(()=>{
      toaster('Booking code copied',{ variant:'info'});
    });
  }
}

function exportCSV(items: ActivityItem[]){
  const header = ['id','type','message','at'];
  const rows = items.map(i=> [i.id, i.type, JSON.stringify(i.message), i.at]);
  const csv = [header.join(','), ...rows.map(r=>r.join(','))].join('\n');
  const blob = new Blob([csv], { type:'text/csv' });
  const url = URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download='activity_feed.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function DetailModal({ id, onClose }: { id:string; onClose:()=>void }){
  const { items } = useActivityFeed();
  const item = items.find(i=>i.id===id);
  if(!item) return null;
  const meta = item.meta as Record<string,unknown>|undefined;
  // Lightweight runtime shape checks (no TS narrowing for simplicity)
  const isMaintCreated = (m:Record<string,unknown>|undefined): boolean => !!m && 'start' in m && 'end' in m;
  const isMaintCascade = (m:Record<string,unknown>|undefined): boolean => {
    if(!m) return false;
    const maybe = (m as { bookings?: unknown }).bookings;
    return Array.isArray(maybe);
  };
  const cascadeBookings = (item.type==='MAINTENANCE_CASCADES' && meta && Array.isArray(meta.bookings)) ? (meta.bookings as Array<Record<string,unknown>>) : [];
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-6 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} className="w-full max-w-md bg-card text-card-foreground rounded-lg border shadow-lg overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between"><h3 className="text-sm font-semibold">Activity Detail</h3><button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">Close</button></div>
        <div className="p-4 space-y-3 text-xs">
          <p><span className="font-semibold">Type:</span> {labelFor(item.type)}</p>
          <p><span className="font-semibold">Timestamp:</span> {item.at}</p>
          <p className="break-words"><span className="font-semibold">Message:</span> {item.message}</p>
          {item.type==='MAINTENANCE_CREATED' && isMaintCreated(meta) && (()=>{
            const m = meta as Record<string,unknown>;
            const maintenanceId = typeof m.maintenanceId === 'string' ? m.maintenanceId : undefined;
            const courtId = typeof m.courtId === 'string' ? m.courtId : '—';
            const start = typeof m.start === 'string' ? m.start : '';
            const end = typeof m.end === 'string' ? m.end : '';
            const cancelledCount = typeof m.cancelledCount === 'number' ? m.cancelledCount : 0;
            return (
              <div className="space-y-1">
                {maintenanceId && <CopyRow label="Maintenance ID" value={maintenanceId} />}
                <CopyRow label="Court" value={courtId} />
                <CopyRow label="Window" value={`${start} → ${end}`} />
                <p><span className="font-semibold">Cancelled Count:</span> {cancelledCount}</p>
              </div>
            );
          })()}
          {item.type==='MAINTENANCE_CASCADES' && isMaintCascade(meta) && cascadeBookings.length>0 && (()=>{
            const m = meta as Record<string,unknown>;
            const maintenanceId = typeof m.maintenanceId === 'string' ? m.maintenanceId : undefined;
            return (
              <div className="space-y-2">
                {maintenanceId && <CopyRow label="Maintenance ID" value={maintenanceId} />}
                <p className="font-semibold">Cancelled Bookings ({cascadeBookings.length}):</p>
              <ul className="max-h-40 overflow-auto space-y-1 pr-1">
                {cascadeBookings.map(b=>{
                  const code = String(b.bookingCode||b.bookingId||'');
                  const ref = b.paymentRef ? ` • Ref:${b.paymentRef}` : '';
                  const phone = b.phone ? ` • ${b.phone}` : '';
                  const prev = b.previousStatus ? ` • was ${b.previousStatus}` : '';
                  return <li key={code} className="flex flex-col bg-muted/40 rounded px-2 py-1">
                    <span className="flex items-center gap-2"><span className="font-mono text-[11px]">{code}</span>{b.amount!=null && <span>KSh {String(b.amount)}</span>}<button onClick={()=>navigator.clipboard.writeText(code)} className="ml-auto text-muted-foreground hover:text-foreground" title="Copy booking code"><Copy className="w-3 h-3"/></button></span>
                    <span className="text-[10px] text-muted-foreground break-all">{phone}{ref}{prev}</span>
                  </li>;
                })}
              </ul>
              </div>
            );
          })()}
          {item.meta && item.type!=='MAINTENANCE_CASCADES' && item.type!=='MAINTENANCE_CREATED' && (
            <pre className="bg-muted rounded p-2 overflow-x-auto text-[10px]">{JSON.stringify(item.meta,null,2)}</pre>
          )}
        </div>
      </div>
    </div>
  );
}

function CopyRow({ label, value }: { label:string; value:string }){
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="font-semibold">{label}:</span>
      <span className="font-mono break-all">{value}</span>
      <button onClick={()=>navigator.clipboard.writeText(value)} className="ml-auto p-1 rounded hover:bg-muted" title="Copy"><Copy className="w-3 h-3"/></button>
    </div>
  );
}

function CategoryBadge({ label, count, onClear, color }: { label:string; count:number; onClear:()=>void; color:'emerald'|'rose'|'indigo' }){
  if(count===0) return null;
  const palette: Record<string,{ bg:string; text:string; hover:string }> = {
    emerald:{ bg:'bg-emerald-500/15', text:'text-emerald-600 dark:text-emerald-400', hover:'hover:bg-emerald-500/20' },
    rose:{ bg:'bg-rose-500/15', text:'text-rose-600 dark:text-rose-400', hover:'hover:bg-rose-500/20' },
    indigo:{ bg:'bg-indigo-500/15', text:'text-indigo-600 dark:text-indigo-400', hover:'hover:bg-indigo-500/20' }
  };
  const p = palette[color];
  return (
    <button onClick={onClear} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${p.bg} ${p.text} ${p.hover} transition-colors`} title={`Clear ${label} counter`}>
      <span>{label}</span>
      <span className="font-semibold">{count}</span>
    </button>
  );
}
