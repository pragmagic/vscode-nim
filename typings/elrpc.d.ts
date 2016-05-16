// Type definitions for elrpc
// Project: https://github.com/kiwanami/node-elrpc

declare module "elrpc" {
    import * as net from 'net';
    
    /**
     * Connect to the TCP port and return RPCServer object.
     * @param {number} port 
     * @param {Method[]} [methods] 
     * @param {string} [host] 
     * @return Promise RPCServer
     */
    export function startClient(port: number, methods?: Method[], host?: string): PromiseLike<RPCServer>;

    export class Method {
        name: string
    }
    
    export class RPCServer {
        socket: net.Socket
        /**
         * Stop the RPCServer connection.
         * All live sessions are terminated with EPCStackException error.
         */
        stop();
        callMethod(...args: any[]): PromiseLike<any[][]>;
        queryMethod(): PromiseLike<any[][]>;
    }
}