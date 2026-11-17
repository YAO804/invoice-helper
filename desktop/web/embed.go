package web

import "embed"

//go:embed index.html style.css *.js
var FS embed.FS
