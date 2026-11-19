package web

import "embed"

//go:embed index.html style.css *.js *.xlsx
var FS embed.FS
