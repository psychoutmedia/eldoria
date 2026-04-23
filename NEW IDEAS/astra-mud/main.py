#!/usr/bin/env python3
"""
Astra-MUD - Main Entry Point
Run with: python main.py
"""

import sys
from pathlib import Path

# Ensure project root in path
sys.path.insert(0, str(Path(__file__).parent))

import uvicorn


def main():
    print("🏰 Astra-MUD - LLM-Powered Text Adventure")
    print("=" * 40)
    print()
    print("Starting server on http://localhost:8765")
    print()
    print("Make sure Ollama is running with:")
    print("  ollama pull phi3  (or your preferred model)")
    print()
    print("Press Ctrl+C to stop")
    print()
    
    # Import here to trigger startup
    from web.server import app
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8765,
        log_level="info",
    )


if __name__ == "__main__":
    main()
