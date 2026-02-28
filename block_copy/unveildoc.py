#!/usr/bin/env python3
"""
UnveilDoc - Reverse obfuscation applied by VeilDoc

Restores original sensitive data from obfuscated DOCX and PDF files using the sidecar JSON.
"""

import argparse
import json
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

# Optional PDF support
try:
    import fitz  # PyMuPDF
    PDF_SUPPORT = True
except ImportError:
    PDF_SUPPORT = False
    fitz = None


class UnveilDoc:
    """Handles deobfuscation of VeilDoc-processed DOCX and PDF files."""
    
    def __init__(self, input_file, sidecar_file=None, output_file=None):
        self.input_file = Path(input_file)
        self.sidecar_file = Path(sidecar_file) if sidecar_file else self._find_sidecar()
        self.output_file = Path(output_file) if output_file else self._generate_output_filename()
        self.obfuscation_map = {}
        self.file_type = None
        
    def _find_sidecar(self):
        """Find the sidecar JSON file for the input DOCX."""
        # Try default location: input.docx.veildoc.json
        default_sidecar = Path(str(self.input_file) + '.veildoc.json')
        if default_sidecar.exists():
            return default_sidecar
        
        # Try alternate location: input.veildoc.json (if input has .veiled.docx)
        if '.veiled' in self.input_file.stem:
            alt_sidecar = self.input_file.with_suffix('.json')
            if alt_sidecar.exists():
                return alt_sidecar
        
        raise FileNotFoundError(
            f"Sidecar JSON not found. Expected: {default_sidecar}\n"
            "Use --sidecar to specify a custom location."
        )
    
    def _generate_output_filename(self):
        """Generate output filename by removing .veiled or appending .unveiled."""
        stem = self.input_file.stem
        suffix = self.input_file.suffix
        parent = self.input_file.parent
        
        # If filename contains .veiled, remove it
        if '.veiled' in stem:
            stem = stem.replace('.veiled', '')
            return parent / f"{stem}.restored{suffix}"
        
        return parent / f"{stem}.unveiled{suffix}"
    
    def load_sidecar(self):
        """Load obfuscation mapping from sidecar JSON."""
        print(f"Loading sidecar: {self.sidecar_file}")
        
        with open(self.sidecar_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        self.obfuscation_map = data.get('obfuscation_map', {})
        self.file_type = data.get('file_type', 'docx')
        
        print(f"Loaded {len(self.obfuscation_map)} obfuscation mappings")
        print(f"File type: {self.file_type}")
        print(f"Original file: {data.get('original_file', 'unknown')}")
        print(f"Timestamp: {data.get('timestamp', 'unknown')}")
        print(f"Seed: {data.get('seed', 'unknown')}")
        
        return data
    
    def deobfuscate_text(self, text):
        """Replace obfuscated text with original using the mapping."""
        if not text:
            return text
        
        result = text
        
        # Sort by length (descending) to replace longer matches first
        sorted_obfuscated = sorted(self.obfuscation_map.keys(), key=len, reverse=True)
        
        for obfuscated in sorted_obfuscated:
            if obfuscated in result:
                original = self.obfuscation_map[obfuscated]
                result = result.replace(obfuscated, original)
        
        return result
    
    def process_xml_element(self, element):
        """Recursively process XML elements to restore original text."""
        # Process text content in <w:t> elements
        if element.tag.endswith('}t') or element.tag == 't':
            if element.text:
                original_text = element.text
                deobfuscated_text = self.deobfuscate_text(element.text)
                if deobfuscated_text != original_text:
                    element.text = deobfuscated_text
        
        # Recursively process children
        for child in element:
            self.process_xml_element(child)
    
    def process_docx(self):
        """Main processing function for DOCX deobfuscation."""
        if not self.input_file.exists():
            raise FileNotFoundError(f"Input file not found: {self.input_file}")
        
        print(f"\nProcessing: {self.input_file}")
        print(f"Output will be: {self.output_file}")
        
        # Load sidecar data
        self.load_sidecar()
        
        # Create temporary directory for extraction
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            
            # Extract DOCX
            print("\nExtracting DOCX archive...")
            with ZipFile(self.input_file, 'r') as zip_ref:
                zip_ref.extractall(temp_path)
            
            # Process document.xml
            doc_xml_path = temp_path / 'word' / 'document.xml'
            if not doc_xml_path.exists():
                raise ValueError("Invalid DOCX file: word/document.xml not found")
            
            print("Parsing document.xml...")
            # Register namespaces to preserve them
            namespaces = {}
            for event, elem in ET.iterparse(doc_xml_path, events=['start-ns']):
                ns, url = elem
                namespaces[ns] = url
                if ns:
                    ET.register_namespace(ns, url)
            
            # Parse and process XML
            tree = ET.parse(doc_xml_path)
            root = tree.getroot()
            
            print("Restoring original data...")
            self.process_xml_element(root)
            
            # Write modified XML back
            print("Writing restored XML...")
            tree.write(doc_xml_path, encoding='utf-8', xml_declaration=True)
            
            # Repack into DOCX
            print("Repacking DOCX archive...")
            with ZipFile(self.output_file, 'w', ZIP_DEFLATED) as zip_out:
                for file_path in temp_path.rglob('*'):
                    if file_path.is_file():
                        arcname = file_path.relative_to(temp_path)
                        zip_out.write(file_path, arcname)
        
        print(f"\n✓ Successfully restored original document: {self.output_file}")
    
    def process_pdf(self):
        """Main processing function for PDF deobfuscation."""
        if not self.input_file.exists():
            raise FileNotFoundError(f"Input file not found: {self.input_file}")
        
        if not PDF_SUPPORT:
            raise ImportError("PDF support requires PyMuPDF. Install with: pip install PyMuPDF")
        
        print(f"\nProcessing PDF: {self.input_file}")
        print(f"Output will be: {self.output_file}")
        
        # Load sidecar data
        self.load_sidecar()
        
        # Open the PDF
        print("\nOpening PDF document...")
        doc = fitz.open(self.input_file)
        
        print(f"Found {len(doc)} pages")
        print("Restoring original data...")
        
        # Process each page
        for page_num in range(len(doc)):
            page = doc[page_num]
            
            # Get all text instances
            text_instances = page.get_text("dict")
            
            # Collect redaction areas and build new text
            redact_areas = []
            tw = fitz.TextWriter(page.rect)
            font = fitz.Font("cjk")
            
            for block in text_instances.get("blocks", []):
                if block.get("type") == 0:  # Text block
                    for line in block.get("lines", []):
                        for span in line.get("spans", []):
                            original_text = span.get("text", "")
                            if not original_text:
                                continue
                            
                            # Deobfuscate text
                            deobfuscated_text = self.deobfuscate_text(original_text)
                            
                            # Get formatting
                            bbox = span["bbox"]
                            size = span.get("size", 11)
                            color = span.get("color", 0)
                            
                            # Store area for redaction
                            redact_areas.append(fitz.Rect(bbox))
                            
                            # Convert color
                            if isinstance(color, int):
                                r = ((color >> 16) & 0xFF) / 255.0
                                g = ((color >> 8) & 0xFF) / 255.0
                                b = (color & 0xFF) / 255.0
                                color = (r, g, b)
                            
                            # Add to text writer
                            tw.append(
                                (bbox[0], bbox[3]),
                                deobfuscated_text,
                                font=font,
                                fontsize=size
                            )
            
            # Redact all original text
            for area in redact_areas:
                page.add_redact_annot(area, fill=(1, 1, 1))
            page.apply_redactions()
            
            # Write restored text
            tw.write_text(page)
        
        # Save restored PDF
        print("Saving restored PDF...")
        doc.save(self.output_file, garbage=4, deflate=True, clean=True)
        doc.close()
        
        print(f"\n✓ Successfully restored original PDF: {self.output_file}")
    
    def process(self):
        """Process the document based on file type from sidecar."""
        if self.file_type == 'docx':
            self.process_docx()
        elif self.file_type == 'pdf':
            self.process_pdf()
        else:
            # Try to detect from file extension if file_type not in sidecar
            suffix = self.input_file.suffix.lower()
            if suffix == '.docx':
                self.process_docx()
            elif suffix == '.pdf':
                self.process_pdf()
            else:
                raise ValueError(f"Unknown file type: {self.file_type or suffix}")


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description='UnveilDoc - Restore original data from VeilDoc-obfuscated DOCX and PDF files',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s document.veiled.docx
  %(prog)s report.veiled.pdf
  %(prog)s document.veiled.docx -o original.docx
  %(prog)s document.veiled.docx --sidecar custom.json

Requires the .veildoc.json sidecar file created by VeilDoc.

Note: PDF support requires PyMuPDF (install: pip install PyMuPDF)
        """
    )
    
    parser.add_argument(
        'input',
        help='Input obfuscated DOCX or PDF file'
    )
    
    parser.add_argument(
        '-o', '--output',
        help='Output file path (default: input.unveiled.docx/pdf)'
    )
    
    parser.add_argument(
        '--sidecar',
        help='Path to sidecar JSON file (default: auto-detect)'
    )
    
    parser.add_argument(
        '-v', '--verbose',
        action='store_true',
        help='Enable verbose output'
    )
    
    args = parser.parse_args()
    
    try:
        unveildoc = UnveilDoc(args.input, args.sidecar, args.output)
        unveildoc.process()
        return 0
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        if args.verbose:
            import traceback
            traceback.print_exc()
        return 1


if __name__ == '__main__':
    sys.exit(main())
