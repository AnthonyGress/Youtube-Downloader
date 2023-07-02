import { useRef, useState } from 'react';
import { MemoryRouter as Router, Switch, Route } from 'react-router-dom';
import { Form, Button } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleInfo, faRefresh, faTimes } from '@fortawesome/free-solid-svg-icons';
import { Bars } from 'react-loader-spinner';
import { Box } from '@mui/material';
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
    const [selectedFile, setSelectedFile] = useState<any>('');

    const inputRef = useRef<any>();

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
        } else if (selectedFile) {
            window.api.audio({file: selectedFile.path});
        }
        else {
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
        } else if (selectedFile) {
            window.api.video({file: selectedFile.path});
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
        if (event.source === window && !event.data.source && !event.data.type) {
            console.log('from backend:', event.data);
        }

        if (event.data.urlsRejected) {
            const urls = event.data.urlsRejected;
            let errorString = '';

            urls.map((url: string) => {
                errorString += `${url} <br />`
            })


            Swal.fire({
                customClass: {
                    title: 'swal2-title',
                },
                title: 'Finished with Errors!',
                html: `${urls.length} URLs failed <br/><br/> <div style="text-align: left;">${errorString}</div>`,
                icon: 'error',
                confirmButtonText: 'Ok',
            });
            setLoading(false);
        }
        if (event.source === window && typeof event.data === 'string') {
            if (event.data.includes('starting update')){
                Swal.fire({
                    customClass: {
                        title: 'swal2-title',
                    },
                    title: 'Updating',
                    text: 'The update is in progress, please wait...',
                    icon: 'info',
                    confirmButtonText: 'Ok',
                });
            }

            if (event.data.includes('update complete')){
                Swal.fire({
                    customClass: {
                        title: 'swal2-title',
                    },
                    title: 'Done!',
                    text: 'Update successful! Please restart the app.',
                    icon: 'success',
                    confirmButtonText: 'Restart',
                }).then((result) => {
                    if (result.isConfirmed) {
                        window.api.coms('restart');
                    }
                })
            }

            if (event.data === 'success') {
                Swal.fire({
                    customClass: {
                        title: 'swal2-title',
                    },
                    title: 'Success!',
                    text: 'Done! Your files are in the Downloads folder.',
                    icon: 'success',
                    confirmButtonText: 'Ok',
                });
                setLoading(false);
                setYoutubeUrl('');
                inputRef.current.value = null
                setSelectedFile('');

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
                <h1>Youtube Downloader</h1>
            </div>
            <div style={{ marginTop: '3rem' }}>
                <Form onSubmit={e => {e.preventDefault(); downloadAudio();}}>
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
                        <>
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
                            <div className='center'>
                                <input
                                    onChange={(e: any) =>{
                                        setSelectedFile(e.currentTarget.files[0])
                                    }}
                                    type="file"
                                    id="files"
                                    name="files"
                                    className="form-control"
                                    accept='.csv'
                                    ref={inputRef}
                                    style={{ display: 'none' }}
                                />

                                <Box mt={2}>
                                    <Button
                                        onClick={() => inputRef.current.click()}
                                        style={{maxWidth: 150}}>{'Select File'}
                                    </Button>
                                </Box>
                                <Box mt={2}>{selectedFile ? `${selectedFile.name}` : 'No File Selected'}</Box>
                                <Box mt={2} ml={2}>
                                    <FontAwesomeIcon
                                        icon={faTimes}
                                        className="btn"
                                        size='lg'
                                        onClick={() => {
                                            inputRef.current.value = null;
                                            setSelectedFile('');
                                        }}
                                    />
                                </Box>
                            </div>
                        </>

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
