// Arvo working calendar: Monday-Friday, 09:30-18:30, excluding configured holidays.
const OPEN_MIN = 9 * 60 + 30;
const CLOSE_MIN = 18 * 60 + 30;
const DAY_SECONDS = (CLOSE_MIN - OPEN_MIN) * 60;
const targets = {
  CRITICAL: { reply: 2 * 3600, resolve: DAY_SECONDS },
  MEDIUM: { reply: 4.5 * 3600, resolve: 3 * DAY_SECONDS },
  LOW: { reply: DAY_SECONDS, resolve: 5 * DAY_SECONDS }
};
const key = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const isWorkday = (d, holidays = new Set()) => d.getDay() !== 0 && d.getDay() !== 6 && !holidays.has(key(d));
export function addWorkingSeconds(input, seconds, holidays = new Set()) {
  let d = new Date(input);
  let remaining = Math.max(0, Number(seconds));
  // Move to the next available working minute when outside business hours.
  for (let guard = 0; remaining > 0 && guard < 5000; guard++) {
    if (!isWorkday(d, holidays)) { d.setDate(d.getDate()+1); d.setHours(9,30,0,0); continue; }
    const mins = d.getHours()*60 + d.getMinutes() + d.getSeconds()/60;
    if (mins < OPEN_MIN) { d.setHours(9,30,0,0); continue; }
    if (mins >= CLOSE_MIN) { d.setDate(d.getDate()+1); d.setHours(9,30,0,0); continue; }
    const available = (CLOSE_MIN - mins) * 60;
    const used = Math.min(remaining, available);
    d = new Date(d.getTime() + used*1000);
    remaining -= used;
    if (remaining > 0) { d.setDate(d.getDate()+1); d.setHours(9,30,0,0); }
  }
  return d;
}
export function workingSecondsBetween(start, end, holidays = new Set()) {
  let cursor = new Date(start), finish = new Date(end), total = 0;
  if (finish <= cursor) return 0;
  for (let guard=0; cursor < finish && guard<5000; guard++) {
    if (!isWorkday(cursor, holidays)) { cursor.setDate(cursor.getDate()+1); cursor.setHours(9,30,0,0); continue; }
    const mins = cursor.getHours()*60 + cursor.getMinutes() + cursor.getSeconds()/60;
    if (mins < OPEN_MIN) { cursor.setHours(9,30,0,0); continue; }
    if (mins >= CLOSE_MIN) { cursor.setDate(cursor.getDate()+1); cursor.setHours(9,30,0,0); continue; }
    const endOfDay = new Date(cursor); endOfDay.setHours(18,30,0,0);
    const segmentEnd = finish < endOfDay ? finish : endOfDay;
    total += Math.max(0, (segmentEnd-cursor)/1000);
    cursor = new Date(segmentEnd);
    if (cursor < finish && cursor >= endOfDay) { cursor.setDate(cursor.getDate()+1); cursor.setHours(9,30,0,0); }
  }
  return Math.floor(total);
}
export function deadlines(priority, createdAt, holidays = new Set()) {
  const target = targets[priority] ?? targets.MEDIUM;
  return { replyDueAt: addWorkingSeconds(createdAt, target.reply, holidays), resolutionDueAt: addWorkingSeconds(createdAt, target.resolve, holidays) };
}
export function slaTargetSeconds(priority, kind='reply') { return targets[priority]?.[kind] ?? targets.MEDIUM[kind]; }
