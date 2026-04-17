import { PAL } from './constants'

export function companyAccent(id, index = 0) {
  let h = index
  for (let i = 0; i < (id || '').length; i++) h += (id || '').charCodeAt(i)
  return PAL[h % PAL.length]
}
