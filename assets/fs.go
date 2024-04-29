package assets

import "embed"

//go:embed rtgraph/dist/*.js rtgraph/*.js rtgraph/*.css rtgraph/purecss/*.css
var FS embed.FS
