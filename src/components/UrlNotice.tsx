export function UrlNotice({ message }: { message: string }): JSX.Element | null {
  return message ? <p role="status" className="url-notice">{message}</p> : null;
}
