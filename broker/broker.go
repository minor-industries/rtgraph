package broker

import "sync/atomic"

// https://stackoverflow.com/questions/36417199/how-to-broadcast-message-using-channel

type Message interface {
	Name() string
}

type Broker struct {
	subCount  int64  // needs 64-bit alignment
	dropCount uint64 // needs 64-bit alignment

	stopCh    chan struct{}
	publishCh chan Message
	subCh     chan chan Message
	unsubCh   chan chan Message
}

func NewBroker() *Broker {
	return &Broker{
		stopCh:    make(chan struct{}),
		publishCh: make(chan Message, 1),
		subCh:     make(chan chan Message, 1),
		unsubCh:   make(chan chan Message, 1),
	}
}

func (b *Broker) Start() {
	subs := map[chan Message]struct{}{}
	for {
		select {
		case <-b.stopCh:
			return
		case msgCh := <-b.subCh:
			subs[msgCh] = struct{}{}
			atomic.StoreInt64(&b.subCount, int64(len(subs)))
		case msgCh := <-b.unsubCh:
			delete(subs, msgCh)
			atomic.StoreInt64(&b.subCount, int64(len(subs)))
		case msg := <-b.publishCh:
			for msgCh := range subs {
				// msgCh is buffered, use non-blocking send to protect the broker:
				select {
				case msgCh <- msg:
				default:
					atomic.AddUint64(&b.dropCount, 1)
				}
			}
		}
	}
}

func (b *Broker) Stop() {
	close(b.stopCh)
}

func (b *Broker) Subscribe() chan Message {
	msgCh := make(chan Message, 1024)
	b.subCh <- msgCh
	return msgCh
}

func (b *Broker) Unsubscribe(msgCh chan Message) {
	b.unsubCh <- msgCh
}

func (b *Broker) Publish(msg Message) {
	b.publishCh <- msg
}

func (b *Broker) SubCount() int {
	return int(atomic.LoadInt64(&b.subCount))
}

func (b *Broker) DropCount() int {
	return int(atomic.LoadUint64(&b.dropCount))
}

type Publisher interface {
	Publish(msg Message)
}
