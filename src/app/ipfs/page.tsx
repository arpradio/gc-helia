import IPFSPeerManager from "@/components/peer-manager";

export default function User() {

    return(
        <section className="flex flex-col items-center justify-center text-neutral-300 h-full h-screen">
            <h1 className="text-2xl">GC-IPFS</h1>
            <h2>A client side IPFS node to empower users!</h2>
              <IPFSPeerManager/>
            <div className=" 0 w-full max-w-md flex flex-col items-center justify-center mt-4 p-4">
           <h2 >Upload a File</h2>
            <input type="file" title="Upload File" className="my-4 bg-blue-200 border-4 border-neutral-800"/>
            </div>

            <h2 className="block  pt-2 w-full text-center">Fetch a File</h2>
            <div className=" flex  max-w-md items-center justify-center ">
       
                
                <input type="text" placeholder="Enter CID" className="my-4 p-2 md:w-96  bg-blue-200 border-4 border-neutral-800"/>
            <button className='py-2 mx-2'>Fetch</button>
            </div>

          
        </section>
    )
}