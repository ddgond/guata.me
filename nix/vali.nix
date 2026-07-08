# Vali (https://github.com/slashP/Vali), the GeoGuessr map generator, packaged
# from its NuGet global-tool release. Bump `version` and `nugetHash` together:
#   nix-prefetch-url https://api.nuget.org/v3-flatcontainer/vali/<version>/vali.<version>.nupkg
#   nix hash convert --hash-algo sha256 --from nix32 <output>
{ pkgs }:

pkgs.buildDotnetGlobalTool {
  pname = "vali";
  nugetName = "Vali";
  version = "3.1.0";
  nugetHash = "sha256-XnMle8dC00HFpWNFpzR8qaKUAOwx/ppbTIgrfERHxqs=";

  # The tool ships net8.0 (and net10.0) builds; pin the matching LTS runtime
  dotnet-runtime = pkgs.dotnetCorePackages.runtime_8_0;

  meta = with pkgs.lib; {
    description = "Tool for creating GeoGuessr maps from pre-generated street view location data";
    homepage = "https://github.com/slashP/Vali";
    license = licenses.mit;
    mainProgram = "vali";
  };
}
