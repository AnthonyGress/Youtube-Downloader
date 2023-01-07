import { useState } from 'react';
import { MemoryRouter as Router, Switch, Route } from 'react-router-dom';
import { Form, Button } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleInfo, faRefresh } from '@fortawesome/free-solid-svg-icons';
import { Bars } from 'react-loader-spinner';
import Swal from 'sweetalert2';
import packageJson from '../../release/app/package.json';

import logo from '../../assets/icons/logo.png';
import './App.css';

declare global {
    interface Window {
        api?: any;
    }
}

const Main = () => {
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [showInfoPage, setShowInfoPage] = useState(false);
    const [loading, setLoading] = useState(false);

    // const [terminalOutput, setTerminalOutput] = useState('');
    // const outputRef = useRef(null);

    const isValidUrl = () => {
        const regex = /^(?!^youtube\.com$|^youtube\.com\/$|^http:\/\/youtube\.com\/$|^https:\/\/youtube\.com\/$).*youtube\.com.*$/;

        if (regex.test(youtubeUrl)){
            return true;
        } else {
            return false;
        }
    };

    const downloadAudio = async () => {
        if (isValidUrl()) {
            setLoading(true);
            window.api.audio(youtubeUrl);
        } else {
            Swal.fire({
                customClass: {
                    title: 'swal2-title',
                },
                title: 'Bad Url!',
                text: 'Check your Youtube URL and try again.',
                icon: 'error',
                confirmButtonText: 'Ok',
            });
        }
    };

    const downloadVideo = async () => {
        if (isValidUrl()) {
            setLoading(true);
            window.api.video(youtubeUrl);
        } else {
            Swal.fire({
                customClass: {
                    title: 'swal2-title',
                },
                title: 'Bad Url!',
                text: 'Check your Youtube URL and try again.',
                icon: 'error',
                confirmButtonText: 'Ok',
            });
        }
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
            console.log('this is event.data', event.data);

            if (event.data === 'success') {
                Swal.fire({
                    customClass: {
                        title: 'swal2-title',
                    },
                    title: 'Success!',
                    text: 'Thank you for using Mac the Ripper! Your file is in the Downloads folder.',
                    icon: 'success',
                    confirmButtonText: 'Ok',
                });
                setLoading(false);
                setYoutubeUrl('');
            } else if (
                event.data.includes('error') ||
                event.data.includes('failed')
            ) {
                Swal.fire({
                    customClass: {
                        title: 'swal2-title',
                    },
                    title: 'Whoops!',
                    text: 'Something went wrong.',
                    icon: 'error',
                    confirmButtonText: 'Ok',
                });
                setLoading(false);
            }
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
                <Form onSubmit={e => {e.preventDefault(); downloadVideo();}}>
                    <Form.Group
                        className="mb-3 center"
                        controlId="formBasicName"
                    >
                        <Form.Control
                            type="url"
                            placeholder="https://someYoutubeUrl.com"
                            name="url"
                            className="url-input"
                            required
                            onChange={(e) => setYoutubeUrl(e.target.value)}
                            value={youtubeUrl}
                        />
                    </Form.Group>
                    {loading ? (

                        <div className="center bars">
                            <div className="center">
                                <h3>Downloading...</h3>
                            </div>
                            <div>
                                <Bars
                                    height="80"
                                    width="80"
                                    color="#ffffff"
                                    ariaLabel="bars-loading"
                                    wrapperStyle={{}}
                                    wrapperClass=""
                                    visible={true}
                                />
                            </div>
                        </div>
                    ) : (
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
                    )}
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

            {showInfoPage ? (
                <div id="info-page">
                    <div className="button-group">
                        <div className="center">{`Version: ${packageJson.version}`}</div>
                        <a
                            href="https://anthonygress.dev"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <div
                                className="center"
                                style={{
                                    marginTop: '10px',
                                    marginBottom: '10px',
                                }}
                            >
                                <button>{'Built By Anthony'}</button>
                            </div>
                        </a>
                    </div>
                </div>
            ) : null}
            <div className="footer-btns">
                <FontAwesomeIcon
                    icon={faCircleInfo}
                    className="btn"
                    onClick={() => {
                        setShowInfoPage(!showInfoPage);
                    }}
                />
                <FontAwesomeIcon
                    icon={faRefresh}
                    className="btn"
                    onClick={() => {
                        location.reload();
                    }}
                />
            </div>
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
