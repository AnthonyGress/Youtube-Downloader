import { parse } from 'csv-parse';
import fs from 'fs';

export const parseAndDownload = async (filepath: string, downloadAction: (url: string) => any, callback: any) => {
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
            console.log(records.length);

        }
    });

    parser.on('end', () => {
        console.log(records);
        const errorsArr: string[] = [];

        Promise.all(records.map(async (url) => {
            try {
                const response = await downloadAction(url)
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
            console.log('done with all');

        })

    });


    // Catch any error
    parser.on('error', (err) => {
        console.log('csv parsing error');
        console.error(err.message);
        callback(`error ${err.message}`)

    });

    fs.createReadStream(filepath).pipe(parser)
}
