import {execFile} from 'node:child_process'

export async function copyToClipboard(content: string): Promise<boolean> {
  const cmd =
    process.platform === 'darwin' ? 'pbcopy' : process.platform === 'win32' ? 'clip' : 'xclip -selection clipboard'
  try {
    const [bin, ...args] = cmd.split(' ')
    await new Promise<void>((resolvePromise, rejectPromise) => {
      const child = execFile(bin, args, (error) => (error ? rejectPromise(error) : resolvePromise()))
      child.stdin?.write(content)
      child.stdin?.end()
    })
    return true
  } catch {
    return false
  }
}
