declare module 'qvd4js' {
    export class QvdDataFrame {
        static fromQvd(path: string): Promise<QvdDataFrame>;
        static fromDict(dict: object): Promise<QvdDataFrame>;
        head(n: number): QvdDataFrame;
        tail(n: number): QvdDataFrame;
        rows(...args: number[]): QvdDataFrame;
        at(row: number, column: string): any;
        select(...args: string[]): QvdDataFrame;
        toDict(): Promise<{ data: any[] }>;
        toQvd(path: string): Promise<void>;
    }

    export class QvdFileReader {
        // Add methods as needed
    }

    export class QvdFileWriter {
        // Add methods as needed
    }

    export class QvdSymbol {
        // Add methods as needed
    }
}
