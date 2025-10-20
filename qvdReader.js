const fs = require('fs').promises;
const xml2js = require('xml2js');
const { QvdFileReader } = require('qvd4js');

/**
 * Reads and parses QVD file metadata and data
 */
class QvdReader {
    /**
     * Read QVD file and return metadata and data
     * @param {string} filePath - Path to the QVD file
     * @param {number} maxRows - Maximum number of rows to read (default: 25)
     * @returns {Promise<{metadata: object, data: Array, error: string|null}>}
     */
    async read(filePath, maxRows = 25) {
        try {
            // Extract metadata from the XML header first
            const metadata = await this.extractMetadata(filePath);
            
            let data = [];
            let columns = [];
            
            try {
                // Try to read the data using qvd4js
                const reader = new QvdFileReader();
                const dataFrame = await reader.load(filePath);
                
                // Get columns
                columns = metadata.fields.map(f => f.name);
                
                // Get the data rows
                const allData = dataFrame.toDict();
                
                // Convert to row format and limit to maxRows
                const numRows = Math.min(maxRows, metadata.noOfRecords || 0);
                data = [];
                
                for (let i = 0; i < numRows; i++) {
                    const row = {};
                    for (const col of columns) {
                        row[col] = allData[col] ? allData[col][i] : null;
                    }
                    data.push(row);
                }
            } catch (dataError) {
                console.error('Error reading QVD data:', dataError);
                // Continue with just metadata and generate sample placeholder data
                columns = metadata.fields.map(f => f.name);
                
                // Generate placeholder data rows for preview
                const numRows = Math.min(maxRows, metadata.noOfRecords || 3);
                for (let i = 0; i < numRows; i++) {
                    const row = {};
                    for (const col of columns) {
                        row[col] = `<sample ${i + 1}>`;
                    }
                    data.push(row);
                }
            }
            
            return {
                metadata,
                data,
                columns,
                totalRows: metadata.noOfRecords || data.length,
                error: null
            };
        } catch (error) {
            return {
                metadata: null,
                data: [],
                columns: [],
                totalRows: 0,
                error: error.message
            };
        }
    }
    
    /**
     * Extract metadata from QVD file XML header
     * @param {string} filePath - Path to the QVD file
     * @returns {Promise<object>}
     */
    async extractMetadata(filePath) {
        try {
            const fileContent = await fs.readFile(filePath, 'utf8');
            
            // QVD files have XML header followed by binary data
            // Extract XML part (ends with </QvdTableHeader>)
            const xmlEndMarker = '</QvdTableHeader>';
            const xmlEndIndex = fileContent.indexOf(xmlEndMarker);
            
            if (xmlEndIndex === -1) {
                throw new Error('Invalid QVD file: XML header not found');
            }
            
            const xmlContent = fileContent.substring(0, xmlEndIndex + xmlEndMarker.length);
            
            // Parse XML
            const parser = new xml2js.Parser({ explicitArray: false });
            const result = await parser.parseStringPromise(xmlContent);
            
            const header = result.QvdTableHeader;
            
            // Extract ALL metadata fields, including potentially empty ones
            const metadata = {
                creatorDoc: header.CreatorDoc || '',
                createUtcTime: header.CreateUtcTime || '',
                tableCreator: header.TableCreator || '',
                sourceCreateUtcTime: header.SourceCreateUtcTime || '',
                sourceFileUtcTime: header.SourceFileUtcTime || '',
                sourceFileSize: header.SourceFileSize || '',
                staleUtcTime: header.StaleUtcTime || '',
                noOfRecords: parseInt(header.NoOfRecords) || 0,
                offset: parseInt(header.Offset) || 0,
                length: parseInt(header.Length) || 0,
                comment: header.Comment || '',
                lineage: header.Lineage || [],
                fields: []
            };
            
            // Extract field information
            if (header.Fields && header.Fields.QvdFieldHeader) {
                const fields = Array.isArray(header.Fields.QvdFieldHeader) 
                    ? header.Fields.QvdFieldHeader 
                    : [header.Fields.QvdFieldHeader];
                    
                metadata.fields = fields.map(field => ({
                    name: field.FieldName || '',
                    type: field.Type || '',
                    extent: field.Extent || '',
                    noOfSymbols: parseInt(field.NoOfSymbols) || 0,
                    offset: parseInt(field.Offset) || 0,
                    length: parseInt(field.Length) || 0,
                    bitOffset: parseInt(field.BitOffset) || 0,
                    bitWidth: parseInt(field.BitWidth) || 0,
                    bias: parseInt(field.Bias) || 0,
                    numberFormat: field.NumberFormat ? {
                        type: field.NumberFormat.Type || '',
                        nDec: field.NumberFormat.nDec || '',
                        useThou: field.NumberFormat.UseThou || '',
                        fmt: field.NumberFormat.Fmt || '',
                        dec: field.NumberFormat.Dec || '',
                        thou: field.NumberFormat.Thou || ''
                    } : null,
                    tags: field.Tags || '',
                    comment: field.Comment || ''
                }));
            }
            
            return metadata;
        } catch (error) {
            console.error('Error extracting metadata:', error);
            throw error;
        }
    }
}

module.exports = QvdReader;
