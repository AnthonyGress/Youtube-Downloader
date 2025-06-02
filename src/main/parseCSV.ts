import { parse } from 'csv-parse';
import fs from 'fs';
import { safeLog, safeError } from './utils/safeLogger';

export const parseAndDownload = async (filepath: string, bestQuality: boolean, downloadAction: (url: string, bestQuality?: boolean) => any, callback: any) => {
    const records: string[] = [];

    // Initialize the parser
    const parser = parse({
        delimiter: ',',
        skip_empty_lines: true,
    });

    // Use the readable stream api to consume records
    parser.on('readable', () => {
        let record;
        while ((record = parser.read()) !== null) {
            records.push(record[0]);
            safeLog(records.length);

        }
    });

    parser.on('end', () => {
        safeLog(records);
        const errorsArr: string[] = [];

        Promise.all(records.map(async (url) => {
            try {
                const response = await downloadAction(url, bestQuality)
                if (response !== true) {
                    errorsArr.push(url);
                }
            } catch {
                callback('error')
            }

        })).then(() => {
            if (errorsArr.length > 0) {
                callback({urlsRejected: errorsArr})
            } else {
                callback(true)
            }
            safeLog('done with all');

        })

    });


    // Catch any error
    parser.on('error', (err) => {
        safeLog('csv parsing error');
        safeError(err.message);
        callback(`error ${err.message}`)

    });

    fs.createReadStream(filepath).pipe(parser)
}
