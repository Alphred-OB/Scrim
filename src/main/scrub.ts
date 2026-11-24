import { homedir, userInfo } from 'os'

/** Hides the user's name and home folder in anything we send. */
export function scrub(text: string): string {
  let out = text
  const home = homedir()
  let name = ''
  try {
    name = userInfo().username
  } catch {
    /* no user name */
  }
  const forms = [home, home.replace(/\\/g, '/'), home.replace(/\\/g, '\\\\')]
  forms.push(...forms.map((h) => encodeURIComponent(h)), ...forms.map((h) => encodeURIComponent(h).toLowerCase()))
  for (const h of forms) if (h.length > 3) out = out.split(h).join('~')
  if (name.length > 2) out = out.replace(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), '<user>')
  // keys that must never leave the PC
  out = out.replace(/gsk_[A-Za-z0-9]{10,}/g, 'gsk_<hidden>')
  return out
}

