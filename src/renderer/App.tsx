import { useRef, useState, useEffect } from 'react';
import { MemoryRouter as Router, Switch, Route } from 'react-router-dom';
import { Form, Button } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleInfo, faRefresh, faTimes } from '@fortawesome/free-solid-svg-icons';
import { Bars } from 'react-loader-spinner';
import { Box, FormControlLabel, Typography } from '@mui/material';
import Swal from 'sweetalert2';
import packageJson from '../../release/app/package.json';

import logo from '../../assets/icons/logo.png';
import './App.css';
import { Toggle } from './Toggle';
import { UpdateBtn } from './UpdateBtn';

declare global {
    interface Window {
        api?: any;
    }
}

const Main = () => {
    const [url, setUrl] = useState('');
    const [showInfoPage, setShowInfoPage] = useState(false);
    const [loading, setLoading] = useState(false);
    const [checked, setChecked] = useState(false);
    const [selectedFile, setSelectedFile] = useState<any>('');
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [selectedDirectory, setSelectedDirectory] = useState<string>('');

    const inputRef = useRef<any>();

    // Load saved directory from localStorage on component mount
    useEffect(() => {
        const savedDirectory = localStorage.getItem('outputDirectory');
        if (savedDirectory) {
            setSelectedDirectory(savedDirectory);
        }
    }, []);

    // Save directory to localStorage whenever it changes
    useEffect(() => {
        if (selectedDirectory) {
            localStorage.setItem('outputDirectory', selectedDirectory);
        } else {
            localStorage.removeItem('outputDirectory');
        }
    }, [selectedDirectory]);

    const isValidUrl = () => {
        // Accept any valid URL format (not just YouTube/Instagram)
        // Updated to allow more URL characters including dashes, underscores, and other valid characters
        const regex = /^https?:\/\/(?:[-\w.~:/?#[\]@!$&'()*+,;=%])+(?::[0-9]+)?(?:\/(?:[-\w._~:/?#[\]@!$&'()*+,;=%])*(?:\?(?:[-\w._~:/?#[\]@!$&'()*+,;=%])*)?(?:#(?:[-\w._~:/?#[\]@!$&'()*+,;=%])*)?)?$/i;

        // Also accept URLs without protocol - updated to allow more characters
        const urlWithoutProtocol = /^(?:www\.)?[-\w._~]+\.[-\w._~]+(?:\/(?:[-\w._~:/?#[\]@!$&'()*+,;=%])*(?:\?(?:[-\w._~:/?#[\]@!$&'()*+,;=%])*)?(?:#(?:[-\w._~:/?#[\]@!$&'()*+,;=%])*)?)?$/i;

        if (regex.test(url) || urlWithoutProtocol.test(url)){
            return true;
        } else {
            return false;
        }
    };

    const downloadAudio = async () => {
        if (isValidUrl()) {
            setLoading(true);
            window.api.audio({url: url, directory: selectedDirectory});
        } else if (selectedFile) {
            setLoading(true);
            window.api.audio({file: selectedFile.path, directory: selectedDirectory});
        }
        else {
            Swal.fire({
                customClass: {
                    title: 'swal2-title',
                },
                title: 'Invalid URL!',
                text: 'Please enter a valid URL and try again.',
                icon: 'error',
                confirmButtonText: 'Ok',
            });
        }
    };

    const downloadVideo = async () => {
        const bestQuality = checked
        if (isValidUrl()) {
            setLoading(true);
            window.api.video({url: url, bestQuality: bestQuality, directory: selectedDirectory});
        } else if (selectedFile) {
            setLoading(true);
            window.api.video({file: selectedFile.path, bestQuality: bestQuality, directory: selectedDirectory});
        } else {
            Swal.fire({
                customClass: {
                    title: 'swal2-title',
                },
                title: 'Invalid URL!',
                text: 'Please enter a valid URL and try again.',
                icon: 'error',
                confirmButtonText: 'Ok',
            });
        }
    };

    const selectDirectory = () => {
        window.api.selectDirectory();
    };

    window.addEventListener('message', (event: MessageEvent) => {
        // event.source === window means the message is coming from the preload
        // script, as opposed to from an <iframe> or other source.
        if (event.source === window && !event.data.source && !event.data.type) {
            console.log('from backend:', event.data);
        }

        // Handle directory selection response
        if (event.data.type === 'directorySelected') {
            const { success, path, error } = event.data.data;
            if (success && path) {
                setSelectedDirectory(path);
                Swal.fire({
                    customClass: {
                        title: 'swal2-title',
                    },
                    title: 'Directory Selected!',
                    text: `Downloads will be saved to: ${path}`,
                    icon: 'success',
                    confirmButtonText: 'Ok',
                });
            } else if (error) {
                Swal.fire({
                    customClass: {
                        title: 'swal2-title',
                    },
                    title: 'Error!',
                    text: `Failed to select directory: ${error}`,
                    icon: 'error',
                    confirmButtonText: 'Ok',
                });
            }
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
            if (event.data.includes('Update Available')){
                setUpdateAvailable(true);
            }

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


            if (event.data.includes('win update downloaded')){
                Swal.fire({
                    customClass: {
                        title: 'swal2-title',
                    },
                    title: 'Update Downloaded',
                    text: 'Please run the installer by double clicking on it in your Downloads folder.',
                    icon: 'success',
                    confirmButtonText: 'Ok',
                });
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
                setUrl('');
                if (inputRef.current) {
                    inputRef.current.value = null;
                }
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
                <img width="175px" src={logo} className="spin" alt="logo" />
            </div>
            <div className="center">
                <h1 style={{fontSize: '1.75rem'}}>Youtube Downloader</h1>
            </div>
            {updateAvailable && <UpdateBtn />}
            <div style={{ marginTop: '3rem' }}>
                <Form onSubmit={e => {e.preventDefault(); downloadAudio();}}>
                    <Form.Group
                        className="mb-3 center"
                        controlId="formBasicName"
                    >
                        <Form.Control
                            type="url"
                            placeholder="https://someurl.com"
                            name="url"
                            className="url-input"
                            required
                            onChange={(e) => setUrl(e.target.value)}
                            value={url}
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
                            <div className="center">
                                <FormControlLabel
                                    control={ <Toggle
                                        checked={checked}
                                        onChange={() => setChecked(!checked)}
                                        inputProps={{ 'aria-label': 'controlled' }}
                                        sx={{ m: 1 }}
                                    />
                                    }
                                    label='Best Quality'
                                />

                            </div>
                            {/* Directory Selection */}
                            <Box className='center' mt={2}>
                                <Box display="flex" alignItems="center" justifyContent="center" gap={1}>
                                    <Button
                                        onClick={() => selectDirectory()}
                                        style={{maxWidth: 150}}>
                                        {'Output Folder'}
                                    </Button>
                                    {selectedDirectory && (
                                        <FontAwesomeIcon
                                            icon={faTimes}
                                            className="btn"
                                            size='lg'
                                            onClick={() => {
                                                setSelectedDirectory('');
                                            }}
                                        />
                                    )}
                                </Box>
                            </Box>
                            <Box mt={1} className='vcenter'>
                                <Typography fontSize={12}>
                                    {selectedDirectory ?
                                        `${selectedDirectory.length > 50 ? '...' + selectedDirectory.slice(-50) : selectedDirectory}` :
                                        'Default Downloads Folder'
                                    }
                                </Typography>
                            </Box>
                            <Box className='center' mt={2}>
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
                                        onClick={() => inputRef.current?.click()}
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
                                            if (inputRef.current) {
                                                inputRef.current.value = null;
                                            }
                                            setSelectedFile('');
                                        }}
                                    />
                                </Box>
                            </Box>

                            <div className="center">
                                <Typography fontSize={12} mt={1}>CSV of URLs</Typography>
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
