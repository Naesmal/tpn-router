#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const srcDir = path.join(__dirname, 'src');
const fileExtension = '.js'; // Extension à ajouter aux importations
const typescriptExtension = '.ts'; // Extension des fichiers à analyser

// Expression régulière pour trouver les importations relatives sans extension
const importRegex = /from\s+['"](\.[^'"]*)['"]/g;

// Fonction pour vérifier si un chemin est relatif
function isRelativePath(importPath) {
  return importPath.startsWith('./') || importPath.startsWith('../');
}

// Fonction pour ajouter une extension à un chemin d'importation s'il n'en a pas déjà une
function addExtension(importPath) {
  if (
    importPath.endsWith('.js') ||
    importPath.endsWith('.jsx') ||
    importPath.endsWith('.ts') ||
    importPath.endsWith('.tsx') ||
    importPath.endsWith('.json')
  ) {
    return importPath;
  }
  return `${importPath}${fileExtension}`;
}

// Fonction pour corriger les importations dans un fichier
async function fixImportsInFile(filePath) {
  try {
    console.log(`Traitement du fichier: ${filePath}`);
    
    // Lire le contenu du fichier
    let content = await fs.readFile(filePath, 'utf-8');
    let modified = false;
    
    // Remplacer les importations relatives
    const newContent = content.replace(importRegex, (match, importPath) => {
      if (isRelativePath(importPath) && !importPath.endsWith(fileExtension)) {
        modified = true;
        return `from '${addExtension(importPath)}'`;
      }
      return match;
    });
    
    // Enregistrer le fichier si des modifications ont été apportées
    if (modified) {
      await fs.writeFile(filePath, newContent, 'utf-8');
      console.log(`✓ Importations corrigées dans: ${filePath}`);
    } else {
      console.log(`- Aucune modification nécessaire pour: ${filePath}`);
    }
  } catch (error) {
    console.error(`Erreur lors du traitement de ${filePath}:`, error);
  }
}

// Fonction pour parcourir récursivement un répertoire
async function processDirectory(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    
    if (entry.isDirectory()) {
      await processDirectory(fullPath);
    } else if (entry.name.endsWith(typescriptExtension)) {
      await fixImportsInFile(fullPath);
    }
  }
}

// Ajouter des types explicites aux fonctions anonymes
async function fixAnonymousFunctions(filePath) {
  try {
    console.log(`Vérification des fonctions anonymes dans: ${filePath}`);
    
    // Lire le contenu du fichier
    let content = await fs.readFile(filePath, 'utf-8');
    
    // Exemple de remplacement pour les paramètres 'v' dans les fonctions filter, map, etc.
    // Note: c'est une simplification, un parseur TS serait préférable pour une solution plus robuste
    let newContent = content.replace(/\.map\(async\s*\(\s*(\w+)\s*\)\s*=>/g, (match, paramName) => {
      return `.map(async (${paramName}: any) =>`;
    });
    
    newContent = newContent.replace(/\.map\(\s*(\w+)\s*=>/g, (match, paramName) => {
      return `.map((${paramName}: any) =>`;
    });
    
    newContent = newContent.replace(/\.filter\(\s*(\w+)\s*=>/g, (match, paramName) => {
      return `.filter((${paramName}: any) =>`;
    });
    
    newContent = newContent.replace(/\.find\(\s*(\w+)\s*=>/g, (match, paramName) => {
      return `.find((${paramName}: any) =>`;
    });
    
    newContent = newContent.replace(/\.forEach\(\s*\(\s*(\w+),\s*(\w+)\s*\)\s*=>/g, (match, param1, param2) => {
      return `.forEach((${param1}: any, ${param2}: any) =>`;
    });
    
    // Si des modifications ont été apportées, enregistrer le fichier
    if (newContent !== content) {
      await fs.writeFile(filePath, newContent, 'utf-8');
      console.log(`✓ Types anonymes corrigés dans: ${filePath}`);
    } else {
      console.log(`- Aucune modification de types anonymes nécessaire pour: ${filePath}`);
    }
  } catch (error) {
    console.error(`Erreur lors du traitement des fonctions anonymes dans ${filePath}:`, error);
  }
}

// Fonction pour parcourir récursivement un répertoire et corriger les fonctions anonymes
async function processDirectoryForAnonymousFunctions(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    
    if (entry.isDirectory()) {
      await processDirectoryForAnonymousFunctions(fullPath);
    } else if (entry.name.endsWith(typescriptExtension)) {
      await fixAnonymousFunctions(fullPath);
    }
  }
}

// Exécution principale
async function main() {
  console.log("Correction des importations ESM...");
  await processDirectory(srcDir);
  
  console.log("\nCorrection des types pour les fonctions anonymes...");
  await processDirectoryForAnonymousFunctions(srcDir);
  
  console.log("\nTraitement terminé!");
}

main().catch(error => {
  console.error("Erreur:", error);
  process.exit(1);
});