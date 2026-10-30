const TEXT: Record<number, string> = {
  0: 'Failed',
  101: 'Switching Protocols',
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
  206: 'Partial Content',
  301: 'Moved Permanently',
  302: 'Found',
  304: 'Not Modified',
  307: 'Temporary Redirect',
  308: 'Permanent Redirect',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  408: 'Request Timeout',
  409: 'Conflict',
  413: 'Payload Too Large',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Content',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

// HTTP/2 and HTTP/3 carry no reason phrase, so HAR statusText is often empty.
export const statusText = (status: number, fromHar?: string): string => fromHar || TEXT[status] || '';

export type StatusClass = 'pending' | 'failed' | '1xx' | '2xx' | '3xx' | '4xx' | '5xx';

export function statusClass(status: number): StatusClass {
  if (status <= 0) return 'failed';
  return `${Math.min(5, Math.floor(status / 100))}xx` as StatusClass;
}
