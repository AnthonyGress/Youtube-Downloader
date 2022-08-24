import { useState } from 'react';
import { MemoryRouter as Router, Switch, Route } from 'react-router-dom';
import { Form, Button } from 'react-bootstrap';
import logo from '../../assets/icons/logo.png';
import './App.css';

declare global {
    interface Window {
        api?: any;
    }
}

const Main = () => {
    const [youtubeUrl, setYoutubeUrl] = useState('');
    // const [terminalOutput, setTerminalOutput] = useState('');
    // const outputRef = useRef(null);

    const downloadAudio = async () => {
        window.api.audio(youtubeUrl);
    };

    const downloadVideo = async () => {
        window.api.video(youtubeUrl);
    };

    window.addEventListener('message', (event: MessageEvent) => {
        // event.source === window means the message is coming from the preload
        // script, as opposed to from an <iframe> or other source.
        if (event.source === window) {
            console.log('from preload:', event.data);
        }
        if (event.source === window && typeof event.data === 'string') {
            // console.log('from preload:', event.data);
            let stringData = JSON.stringify(event.data);
            // console.log(stringData);

            stringData = stringData.replace(new RegExp('\\\\n', 'g'), '\n');
            stringData = stringData.slice(1, -1);
            // setTerminalOutput(stringData);
        }
    });

    return (
        <main>
            <div
                className="center"
                style={{ marginTop: '2rem', marginBottom: '1rem' }}
            >
                <img width="200px" src={logo} className="spin" alt="logo" />
            </div>
            <div className="center">
                <h1>Mac The Ripper</h1>
            </div>
            <div className="center">
                <h2>Youtube Downloader</h2>
            </div>
            <div style={{ marginTop: '3rem' }}>
                <Form onSubmit={downloadAudio}>
                    <Form.Group
                        className="mb-3 center"
                        controlId="formBasicName"
                    >
                        <Form.Control
                            type="url"
                            placeholder="https://someYoutubeUrl.com"
                            name="url"
                            required
                            onChange={(e) => setYoutubeUrl(e.target.value)}
                            value={youtubeUrl}
                        />
                    </Form.Group>
                    <div className="button-group">
                        <Button
                            size="lg"
                            className="w-75 dl-btn"
                            onClick={() => downloadAudio()}
                        >
                            Download Audio
                        </Button>
                        <Button
                            size="lg"
                            className="w-75 dl-btn"
                            onClick={() => downloadVideo()}
                        >
                            Download Video
                        </Button>
                    </div>
                </Form>
            </div>
            {/* <div className="terminal-wrapper center">
                <div className="output-terminal">
                    <div className="output-text-box">
                        <pre className="output-text" ref={outputRef}>
                            <span className="dollar">$</span>
                            {terminalOutput}
                        </pre>
                    </div>
                </div>
            </div>
        */}
        </main>
    );
};

export default function App() {
    return (
        <Router>
            <Switch>
                <Route path="/" component={Main} />
            </Switch>
        </Router>
    );
}
