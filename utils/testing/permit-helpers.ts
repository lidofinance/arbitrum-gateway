import { BigNumberish, Signer } from "ethers";
import { ExternallyOwnedAccount } from "@ethersproject/abstract-signer";

import { keccak256, toUtf8Bytes, defaultAbiCoder } from "ethers/lib/utils";
import { ecsign as ecSignBuf } from "ethereumjs-util";

const PERMIT_TYPE_HASH = streccak(
  'Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)'
)
const TRANSFER_WITH_AUTHORIZATION_TYPE_HASH = streccak(
  'TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)'
)

interface Eip1271Contract {
  address: string;
  sign(
    hash: string
  ): Promise<[string, string, string] & { v: string; r: string; s: string }>;
}

async function signEOA(digest: string, account: ExternallyOwnedAccount) {
  return ecSign(digest, account.privateKey)
}

async function signEIP1271(digest: string, eip1271Contract: Eip1271Contract) {
  const sig = await eip1271Contract.sign(digest)
  return { v: sig.v, r: sig.r, s: sig.s }
}

export async function signEOAorEIP1271(digest: string, signer: Eip1271Contract | ExternallyOwnedAccount) {
  if (signer.hasOwnProperty('sign')) {
    return await signEIP1271(digest, signer as Eip1271Contract);
  } else {
    return await signEOA(digest, signer as ExternallyOwnedAccount);
  }
}

export function makeDomainSeparator(name: string, version: string, chainId: BigNumberish, verifyingContract: string) {
  return keccak256(
    defaultAbiCoder.encode(
      ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
      [
        streccak('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'),
        streccak(name),
        streccak(version),
        chainId,
        verifyingContract,
      ]
    )
  )
}

export async function signPermit(
  owner: string,
  signer: ExternallyOwnedAccount | Eip1271Contract,
  spender: string,
  value: number,
  deadline: string,
  nonce: number,
  domainSeparator: string
) {
  const digest = calculatePermitDigest(owner, spender, value, nonce, deadline, domainSeparator)
  return await signEOAorEIP1271(digest, signer)
}

export function calculatePermitDigest(owner: string, spender: string, value: number, nonce: number, deadline: string, domainSeparator: string) {
  return calculateEIP712Digest(
    domainSeparator,
    PERMIT_TYPE_HASH,
    ['address', 'address', 'uint256', 'uint256', 'uint256'],
    [owner, spender, value, nonce, deadline]
  )
}

export function calculateTransferAuthorizationDigest(from: string, to: string, value: number, validAfter: string, validBefore: string, nonce: string, domainSeparator: string) {
  return calculateEIP712Digest(
    domainSeparator,
    TRANSFER_WITH_AUTHORIZATION_TYPE_HASH,
    ['address', 'address', 'uint256', 'uint256', 'uint256', 'bytes32'],
    [from, to, value, validAfter, validBefore, nonce]
  )
}

function calculateEIP712Digest(domainSeparator: string, typeHash: string, types: string[], parameters: unknown[]) {
  const structHash = keccak256(defaultAbiCoder.encode(['bytes32', ...types], [typeHash, ...parameters]));
  const data = '0x1901' + strip0x(domainSeparator) + strip0x(structHash)
  return keccak256(data)
}

function ecSign(digest: string, privateKey: string) {
  const { v, r, s } = ecSignBuf(bufferFromHexString(digest), bufferFromHexString(privateKey))
  return { v, r: hexStringFromBuffer(r), s: hexStringFromBuffer(s) }
}

function strip0x(s: string) {
  return s.substr(0, 2) === '0x' ? s.substr(2) : s
}


function hex(n: number, byteLen = undefined) {
  const s = n.toString(16)
  return byteLen === undefined ? s : s.padStart(byteLen * 2, '0')
}


export function streccak(s: string) {
  return keccak256(toUtf8Bytes(s));
}

function hexStringFromBuffer(buf: Buffer) {
  return '0x' + buf.toString('hex')
}

function bufferFromHexString(hex: string) {
  return Buffer.from(strip0x(hex), 'hex')
}
