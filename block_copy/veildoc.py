#!/usr/bin/env python3
"""
VeilDoc - Layered adversarial obfuscation for .docx and .pdf files

Applies Unicode-based obfuscation to sensitive text patterns in documents.
The document renders identically to humans but confuses LLMs when copy-pasted.
"""

import argparse
import hashlib
import json
import os
import random
import re
import shutil
import sys
import tempfile
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

# Optional PDF support - try to import PyMuPDF (fitz)
try:
    import fitz  # PyMuPDF
    PDF_SUPPORT = True
except ImportError:
    PDF_SUPPORT = False
    fitz = None


# Homoglyph mapping (Latin → Cyrillic/Greek lookalikes)
HOMOGLYPHS = {
    'a': 'а',  # U+0430 Cyrillic Small Letter A
    'e': 'е',  # U+0435 Cyrillic Small Letter Ie
    'o': 'о',  # U+043E Cyrillic Small Letter O
    'p': 'р',  # U+0440 Cyrillic Small Letter Er
    'c': 'с',  # U+0441 Cyrillic Small Letter Es
    'x': 'х',  # U+0445 Cyrillic Small Letter Ha
    'i': 'і',  # U+0456 Cyrillic Small Letter Byelorussian-Ukrainian I
    'A': 'А',  # U+0410 Cyrillic Capital Letter A
    'E': 'Е',  # U+0415 Cyrillic Capital Letter Ie
    'O': 'О',  # U+041E Cyrillic Capital Letter O
    'P': 'Р',  # U+0420 Cyrillic Capital Letter Er
    'C': 'С',  # U+0421 Cyrillic Capital Letter Es
    'X': 'Х',  # U+0425 Cyrillic Capital Letter Ha
    'I': 'І',  # U+0406 Cyrillic Capital Letter Byelorussian-Ukrainian I
}

# Zero-width characters for injection
ZERO_WIDTH_CHARS = [
    '\u200B',  # Zero Width Space
    '\u200C',  # Zero Width Non-Joiner
    '\uFEFF',  # Zero Width No-Break Space
]

# Unicode tag characters for wrapping
TAG_START = '\U000E0001'  # U+E0001
TAG_END = '\U000E007F'    # U+E007F

# Sensitive patterns to detect
PATTERNS = {
    'ssn': re.compile(r'\b\d{3}-\d{2}-\d{4}\b'),
    'credit_card': re.compile(r'\b\d{4}[\s\-]\d{4}[\s\-]\d{4}[\s\-]\d{4}\b'),
    'dollar_amount': re.compile(r'\$[\d,]+(?:\.\d{2})?\b'),
    'email': re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'),
    'phone': re.compile(r'[\+\(]?[0-9][0-9\s\-\(\)]{7,}[0-9]'),
    'account_number': re.compile(r'\b(?:account|routing|IBAN)\s*[:#]?\s*[\dA-Z]{4,}\b', re.IGNORECASE),
    'clearance': re.compile(r'\b(?:SECRET|CONFIDENTIAL|RESTRICTED|TOP\s+SECRET|CLASSIFIED)\b', re.IGNORECASE),
}


class VeilDoc:
    """Handles obfuscation of sensitive data in DOCX and PDF files."""
    
    def __init__(self, input_file, output_file=None, seed=None, full_document=False):
        self.input_file = Path(input_file)
        self.output_file = Path(output_file) if output_file else self._generate_output_filename()
        self.seed = seed if seed is not None else self._generate_seed()
        self.obfuscation_map = {}
        self.file_type = self._detect_file_type()
        self.full_document = full_document  # If True, obfuscate all text; if False, only patterns
    
    def _detect_file_type(self):
        """Detect if input is DOCX or PDF."""
        suffix = self.input_file.suffix.lower()
        if suffix == '.docx':
            return 'docx'
        elif suffix == '.pdf':
            if not PDF_SUPPORT:
                raise ImportError(
                    "PDF support requires PyMuPDF. Install with: pip install PyMuPDF"
                )
            return 'pdf'
        else:
            raise ValueError(f"Unsupported file type: {suffix}. Supported: .docx, .pdf")
        
    def _generate_output_filename(self):
        """Generate output filename by appending .veiled before extension."""
        stem = self.input_file.stem
        suffix = self.input_file.suffix
        parent = self.input_file.parent
        return parent / f"{stem}.veiled{suffix}"
    
    def _generate_seed(self):
        """Generate a random seed for reproducibility."""
        return random.randint(0, 2**32 - 1)
    
    def _hash_string(self, text):
        """Generate a deterministic hash for a string."""
        return int(hashlib.sha256(text.encode()).hexdigest(), 16)
    
    def _apply_homoglyph(self, text, original_text):
        """Layer 1: Replace ~40% of eligible characters with homoglyphs."""
        # Use hash of original text for deterministic randomness
        rng = random.Random(self._hash_string(original_text))
        
        result = []
        for char in text:
            if char in HOMOGLYPHS and rng.random() < 0.4:
                result.append(HOMOGLYPHS[char])
            else:
                result.append(char)
        
        return ''.join(result)
    
    def _inject_zero_width(self, text):
        """Layer 2: Inject zero-width characters every 2-3 characters."""
        result = []
        zwc_index = 0
        
        for i, char in enumerate(text):
            result.append(char)
            # Inject after every 2-3 characters (alternating pattern)
            if (i + 1) % (2 + (i % 2)) == 0 and i < len(text) - 1:
                result.append(ZERO_WIDTH_CHARS[zwc_index % len(ZERO_WIDTH_CHARS)])
                zwc_index += 1
        
        return ''.join(result)
    
    def _wrap_with_tags(self, text):
        """Layer 3: Wrap text with invisible Unicode tag characters."""
        return TAG_START + text + TAG_END
    
    def obfuscate_text(self, text):
        """Apply all three obfuscation layers to text."""
        if not text or text in self.obfuscation_map:
            return self.obfuscation_map.get(text, text)
        
        original = text
        
        # Layer 1: Homoglyph substitution
        text = self._apply_homoglyph(text, original)
        
        # Layer 2: Zero-width character injection
        text = self._inject_zero_width(text)
        
        # Layer 3: Unicode tag wrapping
        text = self._wrap_with_tags(text)
        
        # Store mapping for reversibility
        self.obfuscation_map[text] = original
        
        return text
    
    def detect_and_obfuscate(self, text):
        """Detect sensitive patterns and obfuscate them, or obfuscate entire text if full_document mode."""
        if not text:
            return text
        
        # If full document mode, obfuscate everything
        if self.full_document:
            # Skip very short strings (single characters, punctuation) to preserve formatting
            if len(text.strip()) <= 1:
                return text
            return self.obfuscate_text(text)
        
        # Otherwise, only obfuscate matched patterns (original behavior)
        result = text
        replacements = []
        
        # Collect all matches with their positions
        for pattern_name, pattern in PATTERNS.items():
            for match in pattern.finditer(text):
                replacements.append((match.start(), match.end(), match.group()))
        
        # Sort by start position (descending) to replace from end to start
        replacements.sort(key=lambda x: x[0], reverse=True)
        
        # Apply obfuscation to each match
        for start, end, matched_text in replacements:
            obfuscated = self.obfuscate_text(matched_text)
            result = result[:start] + obfuscated + result[end:]
        
        return result
    
    def process_xml_element(self, element):
        """Recursively process XML elements to find and obfuscate text nodes."""
        # Process text content in <w:t> elements
        if element.tag.endswith('}t') or element.tag == 't':
            if element.text:
                original_text = element.text
                obfuscated_text = self.detect_and_obfuscate(element.text)
                if obfuscated_text != original_text:
                    element.text = obfuscated_text
        
        # Recursively process children
        for child in element:
            self.process_xml_element(child)
    
    def process_docx(self):
        """Main processing function for DOCX files."""
        if not self.input_file.exists():
            raise FileNotFoundError(f"Input file not found: {self.input_file}")
        
        print(f"Processing: {self.input_file}")
        print(f"Output will be: {self.output_file}")
        print(f"Using seed: {self.seed}")
        print(f"Mode: {'Full document obfuscation' if self.full_document else 'Sensitive fields only'}")
        
        # Create temporary directory for extraction
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            
            # Extract DOCX (it's a ZIP file)
            print("Extracting DOCX archive...")
            with ZipFile(self.input_file, 'r') as zip_ref:
                zip_ref.extractall(temp_path)
            
            # Process document.xml
            doc_xml_path = temp_path / 'word' / 'document.xml'
            if not doc_xml_path.exists():
                raise ValueError("Invalid DOCX file: word/document.xml not found")
            
            print("Parsing document.xml...")
            # Register namespace to preserve it
            namespaces = {}
            for event, elem in ET.iterparse(doc_xml_path, events=['start-ns']):
                ns, url = elem
                namespaces[ns] = url
                if ns:
                    ET.register_namespace(ns, url)
            
            # Parse and process XML
            tree = ET.parse(doc_xml_path)
            root = tree.getroot()
            
            print("Obfuscating sensitive data...")
            self.process_xml_element(root)
            
            # Write modified XML back
            print("Writing modified XML...")
            tree.write(doc_xml_path, encoding='utf-8', xml_declaration=True)
            
            # Repack into DOCX
            print("Repacking DOCX archive...")
            with ZipFile(self.output_file, 'w', ZIP_DEFLATED) as zip_out:
                for file_path in temp_path.rglob('*'):
                    if file_path.is_file():
                        arcname = file_path.relative_to(temp_path)
                        zip_out.write(file_path, arcname)
        
        # Save obfuscation map to sidecar JSON
        self._save_sidecar()
        
        print(f"\n✓ Successfully created obfuscated document: {self.output_file}")
        print(f"✓ Obfuscated {len(self.obfuscation_map)} sensitive items")
        print(f"✓ Sidecar saved: {self.output_file}.veildoc.json")
    
    def process_pdf(self):
        """Main processing function for PDF files."""
        if not self.input_file.exists():
            raise FileNotFoundError(f"Input file not found: {self.input_file}")
        
        print(f"Processing PDF: {self.input_file}")
        print(f"Output will be: {self.output_file}")
        print(f"Using seed: {self.seed}")
        print(f"Mode: {'Full document obfuscation' if self.full_document else 'Sensitive fields only'}")
        
        # Open the PDF
        print("Opening PDF document...")
        doc = fitz.open(self.input_file)
        
        print(f"Found {len(doc)} pages")
        print("Obfuscating sensitive data...")
        
        # Process each page
        for page_num in range(len(doc)):
            page = doc[page_num]
            
            # Get all text instances with detailed info
            text_instances = page.get_text("dict")
            
            # Collect all text areas to redact
            redact_areas = []
            
            # Build new text with TextWriter
            tw = fitz.TextWriter(page.rect)
            font = fitz.Font("cjk")  # Unicode-capable font
            
            for block in text_instances.get("blocks", []):
                if block.get("type") == 0:  # Text block
                    for line in block.get("lines", []):
                        for span in line.get("spans", []):
                            original_text = span.get("text", "")
                            if not original_text:
                                continue
                            
                            # Apply obfuscation
                            obfuscated_text = self.detect_and_obfuscate(original_text)
                            
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
                                obfuscated_text,
                                font=font,
                                fontsize=size
                            )
            
            # Redact all original text areas
            for area in redact_areas:
                page.add_redact_annot(area, fill=(1, 1, 1))
            page.apply_redactions()
            
            # Write the new obfuscated text
            tw.write_text(page)
        
        # Save the modified PDF
        print("Saving modified PDF...")
        doc.save(self.output_file, garbage=4, deflate=True, clean=True)
        doc.close()
        
        # Save obfuscation map to sidecar JSON
        self._save_sidecar()
        
        print(f"\n✓ Successfully created obfuscated PDF: {self.output_file}")
        print(f"✓ Obfuscated {len(self.obfuscation_map)} sensitive items")
        print(f"✓ Sidecar saved: {self.output_file}.veildoc.json")
    
    def process(self):
        """Process the document based on file type."""
        if self.file_type == 'docx':
            self.process_docx()
        elif self.file_type == 'pdf':
            self.process_pdf()
        else:
            raise ValueError(f"Unsupported file type: {self.file_type}")
    
    def _save_sidecar(self):
        """Save obfuscation mapping to JSON sidecar file."""
        sidecar_path = Path(str(self.output_file) + '.veildoc.json')
        
        sidecar_data = {
            'original_file': str(self.input_file),
            'output_file': str(self.output_file),
            'file_type': self.file_type,
            'full_document': self.full_document,
            'timestamp': datetime.now().isoformat(),
            'seed': self.seed,
            'obfuscation_count': len(self.obfuscation_map),
            'obfuscation_map': {k: v for k, v in self.obfuscation_map.items()},
        }
        
        with open(sidecar_path, 'w', encoding='utf-8') as f:
            json.dump(sidecar_data, f, indent=2, ensure_ascii=False)


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description='VeilDoc - Apply layered adversarial obfuscation to DOCX and PDF files',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s document.docx --full
  %(prog)s report.pdf --full
  %(prog)s document.docx -o protected.docx --full
  %(prog)s report.pdf --seed 12345
  %(prog)s patent.pdf --full  # Protect entire document (IP/patents)

Supported formats: .docx, .pdf

Obfuscation modes:
  --full: Obfuscate ALL text in the document (recommended for IP/patents)
  default: Only obfuscate detected sensitive patterns (SSN, email, etc.)

The tool can detect and obfuscate these patterns (when --full is not used):
  • Social Security Numbers (SSNs)
  • Credit card numbers
  • Dollar amounts
  • Email addresses
  • Phone numbers
  • Bank/account references
  • Clearance level keywords

A JSON sidecar file is created for reversibility.

Note: PDF support requires PyMuPDF (install: pip install PyMuPDF)
        """
    )
    
    parser.add_argument(
        'input',
        help='Input DOCX or PDF file to obfuscate'
    )
    
    parser.add_argument(
        '-o', '--output',
        help='Output file path (default: input.veiled.docx/pdf)'
    )
    
    parser.add_argument(
        '--seed',
        type=int,
        help='Random seed for reproducibility (default: random)'
    )
    
    parser.add_argument(
        '--full',
        action='store_true',
        help='Obfuscate entire document (not just sensitive fields). Recommended for IP/patents.'
    )
    
    parser.add_argument(
        '-v', '--verbose',
        action='store_true',
        help='Enable verbose output'
    )
    
    args = parser.parse_args()
    
    try:
        veildoc = VeilDoc(args.input, args.output, args.seed, full_document=args.full)
        veildoc.process()
        return 0
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        if args.verbose:
            import traceback
            traceback.print_exc()
        return 1


if __name__ == '__main__':
    sys.exit(main())
