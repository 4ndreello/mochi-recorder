#!/bin/bash

# Script de build para Mochi

echo "🔨 Construindo Mochi..."

# Verificar se Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não encontrado. Por favor, instale Node.js 18+"
    exit 1
fi

# Verificar se FFmpeg está instalado
if ! command -v ffmpeg &> /dev/null; then
    echo "⚠️  FFmpeg não encontrado. A instalação é necessária para o funcionamento."
    echo "   Instale com: sudo apt install ffmpeg (Ubuntu/Debian)"
    echo "   ou: sudo dnf install ffmpeg (Fedora)"
fi

# Instalar dependências
echo "📦 Instalando dependências..."
npm install

# Build
echo "🏗️  Construindo aplicativo..."
npm run build:linux

echo "✅ Build completo!"

