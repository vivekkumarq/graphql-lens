export type OperationType = 'query' | 'mutation' | 'subscription';
export type Transport = 'http' | 'sse' | 'multipart' | 'websocket';

export interface Header {
  name: string;
  value: string;
}

export interface VariableDefinition {
  name: string;
  type: string;
  defaultValue?: string;
}

/** Structure extracted from the GraphQL document by the real parser. */
export interface OperationStructure {
  fields: string[]; // top-level fields, "alias: field" when aliased
  fragments: string[]; // fragment definitions in the document
  fragmentSpreads: string[];
  directives: string[]; // unique directive names used anywhere, e.g. "@include"
  variableDefinitions: VariableDefinition[];
  depth: number;
  fieldCount: number;
  operationCount: number; // operations defined in the document
}

export interface GraphQLOperation {
  index: number;
  name: string; // display name, never empty
  operationName?: string; // as sent by the client or found in the document
  operationType?: OperationType;
  query?: string;
  variables?: unknown;
  extensions?: unknown;
  persistedQueryHash?: string;
  structure?: OperationStructure;
  parseError?: string;
}

export interface GraphQLErrorInfo {
  message: string;
  path?: (string | number)[];
  locations?: { line: number; column: number }[];
  extensions?: unknown;
  operationIndex?: number; // which operation in a batch it belongs to
}

export type ResponseKind = 'json' | 'multipart' | 'sse' | 'text' | 'empty';

export interface ResponsePart {
  label: string;
  raw: string;
  value?: unknown; // parsed JSON, when it is JSON
}

export interface ParsedResponse {
  kind: ResponseKind;
  parts: ResponsePart[];
  errors: GraphQLErrorInfo[];
  parseError?: string;
}

/** Small summary kept per request; the full parse happens on demand. */
export interface ResponseSummary {
  kind: ResponseKind;
  errorCount: number;
  firstError?: string;
  partCount: number;
  parseError?: string;
}

export type ResponseState =
  | { state: 'pending' }
  | { state: 'loaded'; body: string; summary: ResponseSummary; truncated: boolean }
  | { state: 'failed'; message: string };

export interface HarTimings {
  blocked?: number;
  dns?: number;
  connect?: number;
  ssl?: number;
  send?: number;
  wait?: number;
  receive?: number;
}

export interface StreamEvent {
  time: number; // epoch ms
  type: string; // next / error / complete / data ...
  payload?: unknown;
}

export interface GraphQLRequest {
  id: string;
  url: string;
  method: string;
  status: number;
  statusText: string;
  mimeType: string;
  transport: Transport;
  timestamp: number; // epoch ms
  duration: number; // ms
  size: number; // bytes over the wire, best effort
  requestHeaders: Header[];
  responseHeaders: Header[];
  requestBody?: string;
  operations: GraphQLOperation[];
  isBatch: boolean;
  response: ResponseState;
  timings?: HarTimings;
  httpVersion?: string;
  events?: StreamEvent[]; // websocket subscription messages
  wsProtocol?: string;
}
