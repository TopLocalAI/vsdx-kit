declare module "elkjs/lib/elk-worker.min.js" {
  const Worker: new (url?: string) => Worker;

  export { Worker };
  export default { Worker };
}

declare module "elkjs/lib/elk-api.js" {
  export default class ELK {
    constructor(options?: { workerFactory?: () => Worker; workerUrl?: string });
    layout(graph: unknown): Promise<unknown>;
  }
  export type ElkNode = import("elkjs").ElkNode;
  export type ElkExtendedEdge = import("elkjs").ElkExtendedEdge;
}
