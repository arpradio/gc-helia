'use client';

import { FC, useState, useEffect, useRef } from 'react';
import { useWallet, type WalletContextType } from '@/app/providers/walletProvider';
import { Button, ButtonProps } from '@/components/ui/button';
import { Wallet, Loader2, LogOut, ChevronDown, Copy, CheckCircle2, ExternalLink, CreditCard, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

export interface WalletConnectButtonProps extends Omit<ButtonProps, 'onClick' | 'disabled' | 'children'> {}

const WalletConnectButton: FC<WalletConnectButtonProps> = ({
  variant = 'default',
  size = 'default',
  className = '',
  ...buttonProps
}): React.ReactElement => {
  const walletContext: WalletContextType = useWallet();
  const { 
    isConnected, 
    isConnecting, 
    walletData, 
    connect, 
    disconnect, 
    refreshBalance,
    sessionExpired, 
    setIsModalOpen
  } = walletContext;
  
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const chevronRef = useRef<HTMLDivElement>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (chevronRef.current && chevronRef.current.contains(event.target as Node)) {
        return;
      }
      
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleRefreshBalance = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      await refreshBalance();
    } catch (error) {
      console.error("Error refreshing balance:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (copySuccess) {
      const timer = setTimeout(() => setCopySuccess(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [copySuccess]);

  const handleButtonClick = async (): Promise<void> => {
    if (!isConnected) {
      await connect();
      
      // Use a proper wait function that returns a Promise
      const waitForConnection = async () => {
        return new Promise<void>((resolve) => {
          const checkInterval = setInterval(() => {
            if (walletContext.isConnected) {
              clearInterval(checkInterval);
              handleRefreshBalance().then(() => resolve());
            }
          }, 200);
          setTimeout(() => {
            clearInterval(checkInterval);
            resolve();
          }, 5000);
        });
      };
      
      await waitForConnection();
    } else if (sessionExpired) {
      setIsModalOpen(true);
    } else {
      setIsExpanded(!isExpanded);
    }
  };
  
  const handleChevronClick = (e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  const handleDisconnect = (): void => {
    disconnect();
    setIsExpanded(false);
  };

  const truncateAddress = (address: string): string => 
    `${address.slice(0, 6)}...${address.slice(-4)}`;
    
  const formatBalance = (balance: number | null | undefined): string => {
    if (balance === null || balance === undefined || isNaN(balance)) {
      return '0 ₳';
    }
    return `${balance.toLocaleString()} ₳`;
  };

  const copyToClipboard = async (): Promise<void> => {
    if (walletData?.data.address) {
      try {
        await navigator.clipboard.writeText(walletData.data.address);
        setCopySuccess(true);
      } catch (err) {
        console.error('Failed to copy address', err);
      }
    }
  };

  const handleWalletClick = (e: React.MouseEvent): void => {
    setIsExpanded(false);
    e.preventDefault();
    window.open(
      'https://beta-wallet.gamechanger.finance/dashboard',
      '_blank',
      'width=720,height=720,menubar=no,toolbar=no'
    );
  };

  const handleReconnect = (e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    setIsModalOpen(true);
  };

  return (
    <div className="relative items-center flex rounded" ref={buttonRef}>
      <Button
        variant={isConnected && !sessionExpired ? 'outline' : variant}
        size={size}
        className={`font-mono transition-all duration-300 ${className} ${
          isConnected && !sessionExpired 
            ? 'bg-black/30 border-amber-500/30 hover:bg-black/40 text-white' 
            : sessionExpired 
              ? 'bg-red-900/50 border-red-500/30 hover:bg-red-800/60 text-white'
              : ''
        } ${isExpanded ? 'rounded-b-none' : ''}`}
        onClick={handleButtonClick}
        disabled={isConnecting}
        {...buttonProps}
      >
        {isConnecting ? (
          <div className="flex items-center justify-center space-x-2">
            <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
            <span>Connecting...</span>
          </div>
        ) : isConnected && !sessionExpired && walletData ? (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center">
              <span className="h-2 w-2 rounded-full bg-green-500 mr-2 animate-pulse"></span>
              <span>{truncateAddress(walletData.data.address)}</span>
            </div>
            <div className="flex items-center">
              <div className="ml-2 pl-2 border-l border-zinc-600 font-medium text-amber-300">
                {formatBalance(walletData.data.balance)}
              </div>
              <div 
                ref={chevronRef}
                onClick={handleChevronClick}
                className="cursor-pointer ml-2 p-2" 
                aria-label="Toggle wallet details"
              >
                <ChevronDown 
                  className={`h-4 w-4 text-white transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} 
                />
              </div>
            </div>
          </div>
        ) : sessionExpired ? (
          <div className="flex items-center justify-center space-x-2 w-full text-white">
            <AlertTriangle className="h-4 w-4 text-red-300" />
            <span>Session Expired</span>
          </div>
        ) : (
          <div className="flex items-center w-48 justify-center space-x-2 text-neutral-400">
            <Wallet className="h-4 w-4 text-amber-200" />
            <span>Connect Wallet</span>
          </div>
        )}
      </Button>

      {isConnected && !sessionExpired && isExpanded && (
        <div 
          ref={dropdownRef}
          className="absolute right-0 z-50 w-full min-w-[300px] bg-zinc-800 border  border-amber-500/30 rounded shadow-lg shadow-black/50 overflow-hidden top-full"
        >
          <div className="p-4 space-y-4">
            <div className="flex flex-col space-y-1">
              <span className="text-xs text-zinc-400">Wallet Address</span>
           
                <div className="flex items-center justify-between bg-black/30 p-2 rounded-md">
                  <span className="text-sm text-zinc-300 font-mono truncate mr-2">
                    {walletData?.data.address}
                  </span>
                  
                  <button 
                    onClick={copyToClipboard}
                    className="p-1 rounded-md bg-transparent hover:bg-white/20 transition-colors"
                    title="Copy address"
                  >
                    {copySuccess ? 
                      <CheckCircle2 className="h-4 w-4 text-green-500" /> : 
                      <Copy className="h-4 w-4 text-zinc-400 hover:text-amber-400" />
                    }
                  </button>
                </div>
        
            </div>
            
            <div className="flex flex-col space-y-1">
              <span className="text-xs text-zinc-400">Balance</span>
              <div className="flex items-center justify-between bg-black/30 p-2 rounded-md">
                <div className="flex items-center ">
                  <CreditCard className="h-4 w-4 text-amber-400 mr-2" />
                  <span className="text-lg font-medium text-white">
                   <Link href="/wallet"> {formatBalance(walletData?.data.balance)}</Link>
                  </span>
                </div>
                <div className="flex items-center  gap-2">
                <Link 
                    href="https://beta-wallet.gamechanger.finance/dashboard"
                    className="p-1 rounded-md transition-colors hover:bg-white/20"
                    title="Go to wallet"
                    onClick={handleWalletClick}
                    target='_blank'
                    
                  >
                    <Wallet className="h-4 w-4 text-zinc-400 hover:text-amber-400   " />
                  </Link>
                  <Link 
                    href={`https://cardanoscan.io/address/${walletData?.data.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 hover:bg-white/20 rounded-md  transition-colors"
                    title="View on explorer"
                  >
                    <ExternalLink className="h-4 w-4 text-zinc-400 hover:text-amber-400" />
                  </Link>
                </div>
              </div>
            </div>
            
            <Button 
              variant="destructive" 
              size="sm" 
              className="w-full bg-red-900/50 hover:bg-red-800 text-white	border border-red-700/50 mt-2"
              onClick={handleDisconnect}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Disconnect Wallet
            </Button>
          </div>
        </div>
      )}
      
      {sessionExpired && isExpanded && (
        <div 
          ref={dropdownRef}
          className="absolute right-0 z-50 w-full min-w-[300px] bg-red-950/90	border border-red-500/30 rounded-lg shadow-lg shadow-black/50 overflow-hidden top-full"
        >
          <div className="p-4 space-y-4">
            <div className="flex	items-center gap-2 pb-2 border-b border-red-500/20">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              <span className="text-white	font-medium">Session Expired</span>
            </div>

            <p className="text-red-200 text-sm">
              Your wallet session has expired. You need to reconnect to continue using wallet features.
            </p>

            <Button 
              variant="default" 
              size="sm" 
              className="w-full	bg-red-700 hover:bg-red-600 text-white	border border-red-500 mt-2"
              onClick={handleReconnect}
            >
              <Wallet className="mr-2	h-4 w-4" />
              Reconnect Wallet
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WalletConnectButton;
