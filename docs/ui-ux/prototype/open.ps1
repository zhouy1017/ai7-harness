$prototypePath = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'index.html')
Start-Process -FilePath $prototypePath.Path
