#!/bin/bash

# Design Development Prerequisites Check
# Validates that all required tools and files are available for gen-code workflow

echo "==================================="
echo "Design Development Prerequisites"
echo "==================================="
echo ""

# Track overall status
ALL_GOOD=true

# Check 1: Figma MCP Configuration
echo "1. Checking Figma MCP Configuration..."
if [ -f ".vscode/mcp.json" ] || [ -f ".mcp.json" ]; then
    MCP_FILE=""
    if [ -f ".vscode/mcp.json" ]; then
        MCP_FILE=".vscode/mcp.json"
    else
        MCP_FILE=".mcp.json"
    fi

    echo "   ✅ MCP config found: $MCP_FILE"

    # Check for figma-desktop or figma server
    if grep -q "figma-desktop" "$MCP_FILE" || grep -q "\"figma\"" "$MCP_FILE"; then
        echo "   ✅ Figma MCP server: Configured"
    else
        echo "   ❌ Figma MCP server: Not configured"
        echo ""
        read -p "   Would you like to add Figma MCP servers now? (y/n): " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            # Add Figma MCP servers to config
            if command -v jq >/dev/null 2>&1; then
                # Use jq if available for proper JSON manipulation
                TEMP_FILE=$(mktemp)
                jq '.servers["figma-desktop"] = {"type": "http", "url": "http://127.0.0.1:3845/mcp"} | .servers.figma = {"type": "http", "url": "https://mcp.figma.com/mcp"}' "$MCP_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$MCP_FILE"
                echo "   ✅ Added figma-desktop and figma servers to $MCP_FILE"
            else
                # Fallback: manual JSON construction
                cat > "$MCP_FILE" << 'EOF'
{
  "servers": {
    "figma-desktop": {
      "type": "http",
      "url": "http://127.0.0.1:3845/mcp"
    },
    "figma": {
      "type": "http",
      "url": "https://mcp.figma.com/mcp"
    }
  }
}
EOF
                echo "   ✅ Created $MCP_FILE with figma-desktop and figma servers"
            fi
        else
            echo "   ⚠️  Skipped MCP configuration"
            ALL_GOOD=false
        fi
    fi
else
    echo "   ❌ MCP config: Not found"
    echo ""
    read -p "   Would you like to create MCP config now? (y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Determine which file to create
        if [ -d ".vscode" ]; then
            MCP_FILE=".vscode/mcp.json"
        else
            MCP_FILE=".mcp.json"
        fi

        # Create MCP config with Figma servers
        cat > "$MCP_FILE" << 'EOF'
{
  "servers": {
    "figma-desktop": {
      "type": "http",
      "url": "http://127.0.0.1:3845/mcp"
    },
    "figma": {
      "type": "http",
      "url": "https://mcp.figma.com/mcp"
    }
  }
}
EOF
        echo "   ✅ Created $MCP_FILE with figma-desktop and figma servers"
        echo "   📝 Next steps:"
        echo "      1. Restart VS Code to load MCP servers"
        echo "      2. Enable MCP server in Figma Desktop (Shift+D → Enable MCP)"
        echo "      3. Authenticate figma remote server in VS Code"
    else
        echo "   ⚠️  Skipped MCP configuration"
        echo "      → See: .github/ui-fit-finish/initialization/figma-mcp-install.md"
        ALL_GOOD=false
    fi
fi

# Check 2: Figma Desktop Running
echo ""
echo "2. Checking Figma Desktop..."
if pgrep -x "Figma" > /dev/null 2>&1; then
    echo "   ✅ Figma Desktop: Running"
else
    echo "   ⚠️  Figma Desktop: Not running"
    echo "      → Start Figma Desktop app if using figma-desktop MCP"
fi

# Check 3: Design System Guide
echo ""
echo "3. Checking Design System Guide..."
if [ -f ".github/design-system-guide.md" ]; then
    echo "   ✅ design-system-guide.md: Found"
else
    echo "   ❌ design-system-guide.md: Missing"
    echo "      → File not found at .github/design-system-guide.md"
    ALL_GOOD=false
fi

# Final Summary
echo ""
echo "==================================="
if [ "$ALL_GOOD" = true ]; then
    echo "✅ ALL PREREQUISITES MET"
    echo "==================================="
    echo ""
    echo "Ready to run gen-code workflow!"
    echo "Example: \"Generate code from https://figma.com/file/ABC?node-id=123:456\""
    exit 0
else
    echo "❌ PREREQUISITES NOT MET"
    echo "==================================="
    echo ""
    echo "Please resolve the issues above before proceeding."
    echo "See: .github/ui-fit-finish/initialization/figma-mcp-install.md"
    exit 1
fi
