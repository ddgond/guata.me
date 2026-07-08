{ pkgs ? import <nixpkgs> {} }:

let
  vali = import ./nix/vali.nix { inherit pkgs; };
in
pkgs.mkShell {
  buildInputs = [ vali ] ++ (with pkgs; [
    nodejs_24
  ]);

  shellHook = ''
    # Vali's per-country location pool (multi-GB) lives outside the repo so
    # every checkout shares one download
    export VALI_DOWNLOAD_FOLDER="''${VALI_DOWNLOAD_FOLDER:-''${XDG_CACHE_HOME:-$HOME/.cache}/vali}"

    echo "Astro development environment"
    echo "Node version: $(node --version)"
    echo "npm version: $(npm --version)"
    echo ""
    echo "Available commands:"
    echo "  npm install    - Install dependencies"
    echo "  npm run dev    - Start development server"
    echo "  npm run build  - Build for production"
    echo "  npm run preview - Preview production build"
    echo "  npm run vali-maps - Generate GeoGuessr maps for the quiz regions"
  '';
}
