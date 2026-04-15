declare module '@ffmpeg/ffmpeg' {
  export interface FFmpegProgress {
    ratio: number;
    time: number;
  }

  export interface FFmpegOptions {
    log?: boolean;
    logger?: (log: { type: string; message: string }) => void;
    corePath?: string;
    progress?: (progress: FFmpegProgress) => void;
  }

  export interface FFmpeg {
    load(): Promise<void>;
    isLoaded(): boolean;
    run(...args: string[]): Promise<void>;
    FS(method: 'writeFile', name: string, data: Uint8Array): void;
    FS(method: 'readFile', name: string): Uint8Array;
    FS(method: 'unlink', name: string): void;
    setProgress(handler: (progress: FFmpegProgress) => void): void;
    setLogger(handler: (log: { type: string; message: string }) => void): void;
  }

  export function createFFmpeg(options?: FFmpegOptions): FFmpeg;
  export function fetchFile(data: File | Blob | string | ArrayBuffer): Promise<Uint8Array>;
}
