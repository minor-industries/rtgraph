package rtgraph

import (
	"encoding/json"
	"fmt"
	"github.com/gin-gonic/gin"
	"github.com/minor-industries/rtgraph/assets"
	"github.com/minor-industries/rtgraph/internal/subscription"
	"github.com/minor-industries/rtgraph/messages"
	"github.com/pkg/errors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"io/fs"
	"net/http"
	"nhooyr.io/websocket"
	"time"
)

func (g *Graph) setupServer() error {
	r := g.server

	r.GET("/", func(c *gin.Context) {
		c.Redirect(http.StatusMovedPermanently, "/index.html")
	})

	r.GET("/favicon.ico", func(c *gin.Context) {
		c.Status(204)
	})

	g.StaticFiles(assets.FS,
		"rtgraph/dygraph.min.js", "application/javascript",
		"rtgraph/dygraph.min.js.map", "application/javascript",
		"rtgraph/dygraph.css", "text/css",

		"rtgraph/msgpack.min.js", "application/javascript",

		"rtgraph/dist/rtgraph.js", "application/javascript",
		"rtgraph/rtgraph.css", "text/css",

		"rtgraph/purecss/base-min.css", "text/css",
		"rtgraph/purecss/grids-min.css", "text/css",
		"rtgraph/purecss/grids-responsive-min.css", "text/css",
		"rtgraph/purecss/pure-min.css", "text/css",

		"rtgraph/purecss/base.css", "text/css",
		"rtgraph/purecss/grids.css", "text/css",
		"rtgraph/purecss/grids-responsive.css", "text/css",
	)

	r.GET("/ws", func(c *gin.Context) {
		ctx := c.Request.Context()

		conn, wsErr := websocket.Accept(c.Writer, c.Request, &websocket.AcceptOptions{
			InsecureSkipVerify: true,
		})
		if wsErr != nil {
			_ = c.AbortWithError(http.StatusInternalServerError, wsErr)
			return
		}

		defer func() {
			_ = conn.Close(websocket.StatusInternalError, "Closed unexpectedly")
		}()

		_, reqBytes, err := conn.Read(ctx)
		if wsErr != nil {
			fmt.Println("ws read error", err.Error())
			return
		}
		conn.CloseRead(ctx)

		var req subscription.Request
		err = json.Unmarshal(reqBytes, &req)
		if wsErr != nil {
			fmt.Println("ws error", errors.Wrap(err, "unmarshal json"))
			return
		}

		now := time.Now()

		msgCh := make(chan *messages.Data)

		go g.Subscribe(&req, now, msgCh)

		for data := range msgCh {
			binmsg, err := data.MarshalMsg(nil)
			if err != nil {
				panic(errors.Wrap(err, "marshal msg")) // TODO
			}

			if err := conn.Write(ctx, websocket.MessageBinary, binmsg); err != nil {
				fmt.Println(errors.Wrap(err, "write binary to websocket"))
				return
			}
		}
	})

	r.GET("/metrics", gin.WrapH(promhttp.Handler()))

	return nil
}

func (g *Graph) RunServer(address string) error {
	if err := g.server.Run(address); err != nil {
		return errors.Wrap(err, "run")
	}
	return nil
}

func (g *Graph) StaticFiles(fsys fs.FS, files ...string) {
	for i := 0; i < len(files); i += 2 {
		name := files[i]
		ct := files[i+1]
		path := "/" + name
		g.server.GET(path, func(c *gin.Context) {
			header := c.Writer.Header()
			header["Content-Type"] = []string{ct}
			content, err := fs.ReadFile(fsys, name)
			if err != nil {
				c.Status(404)
				return
			}
			_, _ = c.Writer.Write(content)
		})
	}
}
