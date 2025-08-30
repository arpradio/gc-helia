'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react';
import Image from 'next/image';
import { Upload, Download, Loader2, CheckCircle, AlertCircle, Copy, Eye, FileText, Music, Video, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { fetchIPFSContent, normalizeIPFSUrl, extractCidFromIpfsUrl, isLikelyImage, getUrlInfo } from '../utils/verified-fetch-utils';
import { uploadToIPFS } from '@/actions/ipfs';

interface FetchedContent {
  url: string;
  blob: Blob;
  contentType: string;
  size: number;
  cid: string;
  isVerified: boolean;
}

interface UploadResult {
  success: boolean;
  cid?: string;
  url?: string;
  urlChunks?: string[];
  size?: number;
  error?: string;
  source?: string;
}

export default function IPFS() {
  const [cidInput, setCidInput] = useState<string>('');
  const [fetchedContent, setFetchedContent] = useState<FetchedContent | null>(null);
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const blobUrlRef = useRef<string | null>(null);

  // Cleanup blob URLs
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
    };
  }, []);

  const validateCID = useCallback((cid: string): boolean => {
    if (!cid.trim()) return false;
    
    // Extract CID from various formats
    const extractedCid = extractCidFromIpfsUrl(cid);
    return extractedCid !== null;
  }, []);

  const handleFetch = useCallback(async () => {
    const trimmedCid = cidInput.trim();
    
    if (!validateCID(trimmedCid)) {
      setFetchError('Please enter a valid CID or IPFS URL');
      return;
    }

    setIsFetching(true);
    setFetchError(null);
    setFetchedContent(null);

    // Clean up previous blob URL
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    try {
      const normalizedUrl = normalizeIPFSUrl(trimmedCid);
      if (!normalizedUrl) {
        throw new Error('Could not normalize IPFS URL');
      }

      console.log('Fetching content with verified fetch:', normalizedUrl);
      
      const response = await fetchIPFSContent(normalizedUrl);
      
      if (!response.ok) {
        throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();
      const contentType = response.headers.get('content-type') || blob.type || 'application/octet-stream';
      const size = blob.size;
      const cid = extractCidFromIpfsUrl(trimmedCid) || trimmedCid;
      
      // Create blob URL for display
      const blobUrl = URL.createObjectURL(blob);
      blobUrlRef.current = blobUrl;

      const content: FetchedContent = {
        url: blobUrl,
        blob,
        contentType,
        size,
        cid,
        isVerified: true
      };

      setFetchedContent(content);
      console.log('Successfully fetched and verified content:', {
        cid,
        contentType,
        size,
        verified: true
      });

    } catch (error) {
      console.error('Fetch error:', error);
      setFetchError(error instanceof Error ? error.message : 'Failed to fetch content');
    } finally {
      setIsFetching(false);
    }
  }, [cidInput, validateCID]);

  const handleUpload = useCallback(async () => {
    const file = fileInputRef.current?.files?.[0];
    
    if (!file) {
      setUploadError('Please select a file to upload');
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const result = await uploadToIPFS(formData);
      
      if (result.success) {
        setUploadResult(result as UploadResult);
        
        // Clear file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        
        console.log('Upload successful:', result);
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      setUploadError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  }, []);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      // Could add a toast notification here
      console.log('Copied to clipboard:', text);
    }).catch(console.error);
  }, []);

  const formatFileSize = useCallback((bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }, []);

  const getContentIcon = useCallback((contentType: string) => {
    if (contentType.startsWith('image/')) return <Eye className="h-4 w-4" />;
    if (contentType.startsWith('text/')) return <FileText className="h-4 w-4" />;
    if (contentType.startsWith('audio/')) return <Music className="h-4 w-4" />;
    if (contentType.startsWith('video/')) return <Video className="h-4 w-4" />;
    return <Archive className="h-4 w-4" />;
  }, []);

  const renderContent = useCallback((content: FetchedContent) => {
    const { contentType, url, size } = content;

    if (contentType.startsWith('image/')) {
      return (
        <div className="relative w-full max-w-md mx-auto">
          <Image
            src={url}
            alt="IPFS Content"
            width={400}
            height={300}
            className="rounded-lg object-contain max-h-96"
            unoptimized
          />
        </div>
      );
    }

    if (contentType.startsWith('text/')) {
      return (
        <div className="w-full max-w-2xl mx-auto">
          <Card className="bg-neutral-800 border-neutral-700">
            <CardContent className="p-4">
              <pre className="text-sm text-neutral-300 whitespace-pre-wrap overflow-auto max-h-96">
                {/* We'd need to read the blob as text here */}
                <div className="text-neutral-500">
                  Text content preview (implement blob.text() to display)
                </div>
              </pre>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (contentType.startsWith('audio/')) {
      return (
        <div className="w-full max-w-md mx-auto">
          <audio controls className="w-full">
            <source src={url} type={contentType} />
            Your browser does not support the audio element.
          </audio>
        </div>
      );
    }

    if (contentType.startsWith('video/')) {
      return (
        <div className="w-full max-w-2xl mx-auto">
          <video controls className="w-full max-h-96 rounded-lg">
            <source src={url} type={contentType} />
            Your browser does not support the video element.
          </video>
        </div>
      );
    }

    // Generic download for other types
    return (
      <div className="text-center">
        <Alert className="mb-4 bg-neutral-800 border-neutral-600">
          <Archive className="h-4 w-4" />
          <AlertDescription>
            This file type cannot be previewed. You can download it below.
          </AlertDescription>
        </Alert>
        <Button asChild className="bg-blue-600 hover:bg-blue-700">
          <a href={url} download={`ipfs-content-${content.cid}`}>
            <Download className="h-4 w-4 mr-2" />
            Download File ({formatFileSize(size)})
          </a>
        </Button>
      </div>
    );
  }, [formatFileSize]);

  return (
    <section className="flex flex-col items-center justify-center text-neutral-300 min-h-screen p-4">
      <div className="w-full max-w-4xl space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold">GC-IPFS</h1>
          <h2 className="text-lg text-neutral-400">
            A client-side IPFS node with verified fetching to empower users!
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Upload Section */}
          <Card className="bg-neutral-800/50 border-neutral-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload File
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                title="Upload File"
                className="w-full p-3 bg-neutral-700 border-2 border-neutral-600 rounded-lg text-neutral-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                disabled={isUploading}
              />
              
              <Button
                onClick={handleUpload}
                disabled={isUploading}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload to IPFS
                  </>
                )}
              </Button>

              {uploadError && (
                <Alert className="bg-red-900/20 border-red-700">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{uploadError}</AlertDescription>
                </Alert>
              )}

              {uploadResult && (
                <Card className="bg-green-900/20 border-green-700">
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-center gap-2 text-green-400">
                      <CheckCircle className="h-4 w-4" />
                      <span className="font-semibold">Upload Successful!</span>
                    </div>
                    
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between items-center">
                        <span>CID:</span>
                        <div className="flex items-center gap-1">
                          <code className="bg-neutral-700 px-2 py-1 rounded text-xs">
                            {uploadResult.cid?.slice(0, 20)}...
                          </code>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyToClipboard(uploadResult.cid || '')}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      
                      {uploadResult.size && (
                        <div className="flex justify-between">
                          <span>Size:</span>
                          <span>{formatFileSize(uploadResult.size)}</span>
                        </div>
                      )}
                      
                      <div className="flex justify-between">
                        <span>Source:</span>
                        <span className="capitalize">{uploadResult.source}</span>
                      </div>

                      {uploadResult.urlChunks && uploadResult.urlChunks.length > 1 && (
                        <div className="text-xs text-neutral-400">
                          URL chunked into {uploadResult.urlChunks.length} parts for database storage
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>

          {/* Fetch Section */}
          <Card className="bg-neutral-800/50 border-neutral-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5" />
                Fetch Content
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Enter CID or IPFS URL"
                  value={cidInput}
                  onChange={(e) => setCidInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
                  className="w-full p-3 bg-neutral-700 border-2 border-neutral-600 rounded-lg text-neutral-300 placeholder-neutral-500"
                  disabled={isFetching}
                />
                <div className="text-xs text-neutral-500">
                  Supports: CID, ipfs://, gateway URLs, and chunked arrays
                </div>
              </div>
              
              <Button
                onClick={handleFetch}
                disabled={isFetching || !validateCID(cidInput)}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                {isFetching ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Fetching & Verifying...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Fetch with Verification
                  </>
                )}
              </Button>

              {fetchError && (
                <Alert className="bg-red-900/20 border-red-700">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{fetchError}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Content Display */}
        {fetchedContent && (
          <Card className="bg-neutral-800/50 border-neutral-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {getContentIcon(fetchedContent.contentType)}
                Verified IPFS Content
                <CheckCircle className="h-4 w-4 text-green-400" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Content Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-neutral-400">CID:</span>
                  <div className="font-mono text-xs break-all">{fetchedContent.cid}</div>
                </div>
                <div>
                  <span className="text-neutral-400">Type:</span>
                  <div>{fetchedContent.contentType}</div>
                </div>
                <div>
                  <span className="text-neutral-400">Size:</span>
                  <div>{formatFileSize(fetchedContent.size)}</div>
                </div>
                <div>
                  <span className="text-neutral-400">Status:</span>
                  <div className="text-green-400">✓ Verified</div>
                </div>
              </div>

              {/* Content Preview */}
              <div className="border-t border-neutral-700 pt-4">
                {renderContent(fetchedContent)}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}