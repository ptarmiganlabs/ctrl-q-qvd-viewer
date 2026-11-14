import * as vscode from "vscode";
import QvdReader from "./qvdReader.mjs";
import logger from "./logger.mjs";

/**
 * Content provider for QVD metadata comparison
 * Implements VS Code's TextDocumentContentProvider interface for diff viewing
 */
class QvdMetadataCompareProvider {
  /**
   * URI scheme for QVD metadata documents
   */
  static scheme = "qvd-metadata";

  constructor() {
    this.qvdReader = new QvdReader();
    this._onDidChange = new vscode.EventEmitter();
    this.onDidChange = this._onDidChange.event;
  }

  /**
   * Provide text document content for a QVD file's metadata
   * @param {vscode.Uri} uri - URI with the QVD file path in query parameter
   * @returns {Promise<string>} Formatted metadata as text
   */
  async provideTextDocumentContent(uri) {
    try {
      // Extract the actual file path from the URI query
      const filePath = uri.query;

      if (!filePath) {
        logger.error("QvdMetadataCompareProvider: No file path in URI", { uri: uri.toString() });
        return "Error: No file path provided in URI";
      }

      logger.log(`QvdMetadataCompareProvider: Extracting metadata from ${filePath}`);
      
      const startTime = Date.now();
      
      // Read metadata with minimal data loading (maxRows=1)
      // Note: maxRows=0 actually loads all rows, so we use 1 for fast metadata-only loading
      const result = await this.qvdReader.read(filePath, 1);
      
      const elapsedTime = Date.now() - startTime;
      logger.log(`QvdMetadataCompareProvider: Metadata extracted in ${elapsedTime}ms`);

      if (result.error) {
        logger.error(`QvdMetadataCompareProvider: Error reading ${filePath}`, result.error);
        return `Error reading QVD file:\n${result.error}`;
      }

      if (!result.metadata) {
        logger.error(`QvdMetadataCompareProvider: No metadata found in ${filePath}`);
        return "Error: No metadata found in QVD file";
      }

      // Format metadata as diff-friendly text
      const formattedText = this.formatMetadata(result.metadata, filePath);
      
      logger.log(`QvdMetadataCompareProvider: Successfully formatted metadata for ${filePath}`);
      return formattedText;

    } catch (error) {
      logger.error("QvdMetadataCompareProvider: Exception during metadata extraction", error);
      return `Exception occurred:\n${error.message}\n\n${error.stack || ""}`;
    }
  }

  /**
   * Format QVD metadata as structured text suitable for diff comparison
   * @param {object} metadata - QVD metadata object
   * @param {string} filePath - Path to the QVD file
   * @returns {string} Formatted metadata text
   */
  formatMetadata(metadata, filePath) {
    const lines = [];

    // Header
    lines.push("=".repeat(80));
    lines.push(`QVD METADATA: ${filePath}`);
    lines.push("=".repeat(80));
    lines.push("");

    // File Metadata Section
    lines.push("FILE METADATA");
    lines.push("-".repeat(80));
    lines.push(`Table Name:           ${metadata.tableName || "N/A"}`);
    lines.push(`Record Count:         ${metadata.noOfRecords || 0}`);
    lines.push(`Record Byte Size:     ${metadata.recordByteSize || "N/A"}`);
    lines.push(`QV Build Number:      ${metadata.qvBuildNo || "N/A"}`);
    lines.push(`Creator Document:     ${metadata.creatorDoc || "N/A"}`);
    lines.push(`Table Creator:        ${metadata.tableCreator || "N/A"}`);
    lines.push(`Created (UTC):        ${metadata.createUtcTime || "N/A"}`);
    lines.push(`Source Created (UTC): ${metadata.sourceCreateUtcTime || "N/A"}`);
    lines.push(`Source File (UTC):    ${metadata.sourceFileUtcTime || "N/A"}`);
    lines.push(`Source File Size:     ${metadata.sourceFileSize || "N/A"}`);
    lines.push(`Stale (UTC):          ${metadata.staleUtcTime || "N/A"}`);
    lines.push(`Compression:          ${metadata.compression || "N/A"}`);
    lines.push(`Offset:               ${metadata.offset || 0}`);
    lines.push(`Length:               ${metadata.length || 0}`);
    lines.push(`Comment:              ${metadata.comment || "N/A"}`);
    lines.push(`Encryption Info:      ${metadata.encryptionInfo || "N/A"}`);
    lines.push(`Table Tags:           ${metadata.tableTags || "N/A"}`);
    lines.push(`Profiling Data:       ${metadata.profilingData || "N/A"}`);
    lines.push("");

    // Lineage Section
    lines.push("LINEAGE");
    lines.push("-".repeat(80));
    if (metadata.lineage && metadata.lineage.LineageInfo && Array.isArray(metadata.lineage.LineageInfo)) {
      if (metadata.lineage.LineageInfo.length === 0) {
        lines.push("  No lineage information");
      } else {
        metadata.lineage.LineageInfo.forEach((lineageItem, index) => {
          lines.push(`  [${index + 1}] Discriminator: ${lineageItem.Discriminator || "N/A"}`);
          if (lineageItem.Statement) {
            lines.push(`      Statement:     ${lineageItem.Statement}`);
          }
        });
      }
    } else if (Array.isArray(metadata.lineage)) {
      if (metadata.lineage.length === 0) {
        lines.push("  No lineage information");
      } else {
        metadata.lineage.forEach((lineageItem, index) => {
          if (typeof lineageItem === "string") {
            lines.push(`  [${index + 1}] ${lineageItem}`);
          } else if (lineageItem && typeof lineageItem === "object") {
            lines.push(`  [${index + 1}] ${JSON.stringify(lineageItem)}`);
          }
        });
      }
    } else {
      lines.push("  No lineage information");
    }
    lines.push("");

    // Fields Section
    lines.push("FIELD METADATA");
    lines.push("-".repeat(80));
    lines.push(`Total Fields: ${metadata.fields ? metadata.fields.length : 0}`);
    lines.push("");

    if (metadata.fields && metadata.fields.length > 0) {
      metadata.fields.forEach((field, index) => {
        lines.push(`Field ${index + 1}: ${field.name || "Unnamed"}`);
        lines.push(`  Type:           ${field.type || "N/A"}`);
        lines.push(`  Extent:         ${field.extent || "N/A"}`);
        lines.push(`  Symbols:        ${field.noOfSymbols || 0}`);
        lines.push(`  Offset:         ${field.offset || 0}`);
        lines.push(`  Length:         ${field.length || 0}`);
        lines.push(`  Bit Offset:     ${field.bitOffset || 0}`);
        lines.push(`  Bit Width:      ${field.bitWidth || 0}`);
        lines.push(`  Bias:           ${field.bias || 0}`);
        
        // Number format
        if (field.numberFormat) {
          lines.push(`  Number Format:`);
          lines.push(`    Type:         ${field.numberFormat.type || "N/A"}`);
          lines.push(`    Decimals:     ${field.numberFormat.nDec || "N/A"}`);
          lines.push(`    Use Thousand: ${field.numberFormat.useThou || "N/A"}`);
          lines.push(`    Format:       ${field.numberFormat.fmt || "N/A"}`);
          lines.push(`    Decimal Sep:  ${field.numberFormat.dec || "N/A"}`);
          lines.push(`    Thousand Sep: ${field.numberFormat.thou || "N/A"}`);
        } else {
          lines.push(`  Number Format:  N/A`);
        }
        
        // Tags
        if (field.tags && field.tags.length > 0) {
          lines.push(`  Tags:           ${field.tags.join(", ")}`);
        } else {
          lines.push(`  Tags:           None`);
        }
        
        // Comment
        lines.push(`  Comment:        ${field.comment || "N/A"}`);
        lines.push("");
      });
    } else {
      lines.push("  No fields found");
      lines.push("");
    }

    // Footer
    lines.push("=".repeat(80));
    lines.push("END OF METADATA");
    lines.push("=".repeat(80));

    return lines.join("\n");
  }

  /**
   * Notify listeners that a document has changed
   * @param {vscode.Uri} uri - URI of the changed document
   */
  notifyChange(uri) {
    this._onDidChange.fire(uri);
  }

  /**
   * Dispose the provider and clean up resources
   */
  dispose() {
    this._onDidChange.dispose();
  }
}

export default QvdMetadataCompareProvider;
