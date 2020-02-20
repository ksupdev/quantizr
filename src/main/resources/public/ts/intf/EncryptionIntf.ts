import { EncryptionKeyPair } from "../EncryptionKeyPair";

export interface EncryptionIntf {

    KEY_SAVE_FORMAT: string;
    ASYM_ALGO: string;
    HASH_ALGO: string;
    ASYM_IMPORT_ALGO: any;
    STORE_ASYMKEY: string;

    OP_ENC_DEC: string[];
    OP_ENC: string[];
    OP_DEC: string[];

    vector: Uint8Array;

    test(): Promise<string>;
    initKeys(forceUpdate?:boolean, republish?: boolean): any;
    exportKeys(): Promise<string>;
        
    asymEncryptString(key: CryptoKey, data: string): Promise<string>;
    symEncryptString(key: CryptoKey, data: string): Promise<string>;

    asymDecryptString(key: CryptoKey, encHex: string): Promise<string>;
    symDecryptString(key: CryptoKey, encHex: string): Promise<string>;

    convertStringToByteArray(str): any;
    convertByteArrayToString(buffer): any;

    encryptSharableString(publicKey: CryptoKey, data: string): Promise<SymKeyDataPackage>;
    decryptSharableString(privateKey: CryptoKey, skpd: SymKeyDataPackage): Promise<string>;

    getPrivateKey(): Promise<CryptoKey>;
    getPublicKey(): Promise<CryptoKey>;

    importKey(key: JsonWebKey, algos: any, extractable: boolean, keyUsages: string[]): Promise<CryptoKey>;
}

export interface SymKeyDataPackage {
    cipherText: string;
    cipherKey: string;
}

