import * as fs from 'fs';
import * as path from 'path';
import { QvdDataFrame } from 'qvd4js';

export interface QvdFieldMetadata {
    name: string;
    type?: string;
    numberFormat?: {
        type: string;
        nDec?: number;
        useThou?: number;
    };
    tags?: string[];
}

export interface QvdMetadata {
    tableName?: string;
    fields: QvdFieldMetadata[];
    recordCount: number;
    fileSize: number;
    creatorDoc?: string;
    createUtcTime?: string;
    lineage?: string[];
}

export interface QvdData {
    metadata: QvdMetadata;
    rows: any[];
}

/**
 * Parse the XML header from a QVD file to extract metadata
 */
function parseQvdXmlHeader(filePath: string): QvdMetadata {
    const buffer = fs.readFileSync(filePath);
    const xmlEndMarker = Buffer.from('</QvdTableHeader>\r\n');
    const xmlEndIndex = buffer.indexOf(xmlEndMarker);
    
    if (xmlEndIndex === -1) {
        throw new Error('Invalid QVD file: XML header not found');
    }
    
    const xmlContent = buffer.slice(0, xmlEndIndex + xmlEndMarker.length).toString('utf-8');
    
    // Parse metadata from XML
    const metadata: QvdMetadata = {
        fields: [],
        recordCount: 0,
        fileSize: buffer.length
    };
    
    // Extract table name
    const tableNameMatch = xmlContent.match(/<TableName>(.*?)<\/TableName>/);
    if (tableNameMatch) {
        metadata.tableName = tableNameMatch[1];
    }
    
    // Extract record count
    const recordsMatch = xmlContent.match(/<NoOfRecords>(.*?)<\/NoOfRecords>/);
    if (recordsMatch) {
        metadata.recordCount = parseInt(recordsMatch[1], 10);
    }
    
    // Extract creator doc
    const creatorDocMatch = xmlContent.match(/<CreatorDoc>(.*?)<\/CreatorDoc>/);
    if (creatorDocMatch) {
        metadata.creatorDoc = creatorDocMatch[1];
    }
    
    // Extract create time
    const createTimeMatch = xmlContent.match(/<CreateUtcTime>(.*?)<\/CreateUtcTime>/);
    if (createTimeMatch) {
        metadata.createUtcTime = createTimeMatch[1];
    }
    
    // Extract fields
    const fieldsSection = xmlContent.match(/<Fields>([\s\S]*?)<\/Fields>/);
    if (fieldsSection) {
        const fieldMatches = fieldsSection[1].matchAll(/<QvdFieldHeader>([\s\S]*?)<\/QvdFieldHeader>/g);
        
        for (const fieldMatch of fieldMatches) {
            const fieldContent = fieldMatch[1];
            const field: QvdFieldMetadata = { name: '' };
            
            // Extract field name
            const nameMatch = fieldContent.match(/<FieldName>(.*?)<\/FieldName>/);
            if (nameMatch) {
                field.name = nameMatch[1];
            }
            
            // Extract field type
            const typeMatch = fieldContent.match(/<Type>(.*?)<\/Type>/);
            if (typeMatch) {
                field.type = typeMatch[1];
            }
            
            // Extract number format
            const numberFormatMatch = fieldContent.match(/<NumberFormat>([\s\S]*?)<\/NumberFormat>/);
            if (numberFormatMatch) {
                field.numberFormat = { type: '' };
                const formatContent = numberFormatMatch[1];
                
                const typeMatch = formatContent.match(/<Type>(.*?)<\/Type>/);
                if (typeMatch) {
                    field.numberFormat.type = typeMatch[1];
                }
                
                const nDecMatch = formatContent.match(/<nDec>(.*?)<\/nDec>/);
                if (nDecMatch) {
                    field.numberFormat.nDec = parseInt(nDecMatch[1], 10);
                }
                
                const useThouMatch = formatContent.match(/<UseThou>(.*?)<\/UseThou>/);
                if (useThouMatch) {
                    field.numberFormat.useThou = parseInt(useThouMatch[1], 10);
                }
            }
            
            // Extract tags
            const tagsMatch = fieldContent.match(/<Tags>([\s\S]*?)<\/Tags>/);
            if (tagsMatch) {
                const tagMatches = tagsMatch[1].matchAll(/<String>(.*?)<\/String>/g);
                field.tags = Array.from(tagMatches, m => m[1]);
            }
            
            metadata.fields.push(field);
        }
    }
    
    // Extract lineage
    const lineageSection = xmlContent.match(/<Lineage>([\s\S]*?)<\/Lineage>/);
    if (lineageSection) {
        const lineageMatches = lineageSection[1].matchAll(/<LineageInfo>([\s\S]*?)<\/LineageInfo>/g);
        metadata.lineage = [];
        
        for (const lineageMatch of lineageMatches) {
            const lineageContent = lineageMatch[1];
            const discriminatorMatch = lineageContent.match(/<Discriminator>(.*?)<\/Discriminator>/);
            const statementMatch = lineageContent.match(/<Statement>(.*?)<\/Statement>/);
            
            if (discriminatorMatch && statementMatch) {
                metadata.lineage.push(`${discriminatorMatch[1]}: ${statementMatch[1]}`);
            }
        }
    }
    
    return metadata;
}

/**
 * Read a QVD file and return both metadata and sample data
 */
export async function readQvdFile(filePath: string, rowCount: number = 25): Promise<QvdData> {
    try {
        // Parse metadata from XML header
        const metadata = parseQvdXmlHeader(filePath);
        
        // Load data using qvd4js
        const dataFrame = await QvdDataFrame.fromQvd(filePath);
        
        // Get sample rows
        const sampleDataFrame = dataFrame.head(rowCount);
        const rows = await sampleDataFrame.toDict();
        
        return {
            metadata,
            rows: rows.data || []
        };
    } catch (error) {
        throw new Error(`Failed to read QVD file: ${error instanceof Error ? error.message : String(error)}`);
    }
}
