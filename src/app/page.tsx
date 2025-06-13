import { Button } from "@/components/ui/button"; 
import { Poppins } from 'next/font/google';
import { cn } from "@/lib/utils";
import { LoginButton } from "@/components/auth/login-button";
import Image from "next/legacy/image";
import Link from "next/link";
import { Navbar } from "@/components/navigation/navbar";
import { auth } from "@/auth";

const font = Poppins({
  subsets: ["latin"],
  weight: ["600"],
})

export default async function Home() {

  const session = await auth()
  const user = session?.user || undefined
  return (
      <>
          <Navbar user={user} />
          <div className='flex flex-col min-h-screen'>
              <main className='flex flex-1 flex-col items-center justify-center p-24 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sky-400 to-blue-800'>
                  <h2 className='text-center text-white text-3xl font-bold p-2 mb-[2rem]'>
                      Wir bauen um
                  </h2>
                  <div className='w-[70%] max-h-[500px] mx-auto'>
                      <div className='p-5'>
                          <div className='flex mt-4'>
                              <div className='w-1/2 pr-2'>
                                  <div className='bg-gray-100 border-2 border-red-500 rounded-lg overflow-hidden shadow-md text-wrap text-xl space-y-3 mx-auto p-10'>
                                      <p>
                                          Starten Sie mit uns in eine neue Ära der Webentwicklung!
                                      </p>
                                      <p>
                                          Unsere bald erscheinende Website wird ein Zentrum für
                                          Innovation in Webseiten- und Backend-Lösungen sein.
                                          Entdecken Sie die neuesten Trends, Technologien und Best
                                          Practices, die Ihr Online-Business revolutionieren.
                                      </p>
                                      <p>
                                          Ob Sie die Benutzererfahrung Ihrer Website optimieren,
                                          Ihre Backend-Architektur stärken oder einfach nur Ihr
                                          Wissen erweitern möchten – unsere kommende Plattform
                                          bietet Ihnen die Insights und Tools, die Sie benötigen.
                                          Seien Sie gespannt und bereiten Sie sich darauf vor, die
                                          digitale Landschaft mit uns zu verändern. Bleiben Sie dran
                                          für die Enthüllung!
                                      </p>
                                  </div>
                              </div>
                              <div className='flex w-1/2 pl-2 justify-center items-center'>
                                  <div className='transform rotate-3 w-[60%]'>
                                      <Image
                                          src='/web-design.webp'
                                          alt='Bild'
                                          className='rounded-lg'
                                          width={100}
                                          height={100}
                                          layout='responsive'
                                      />
                                  </div>
                              </div>
                          </div>
                      </div>
                  </div>
              </main>
              <footer className='bg-gray-800 text-white text-center p-4 w-full'>
                  <p>© 2024 Mark Pimpl</p>
                  <p>
                      powered by{' '}
                      <Link
                          href='https://www.fb-dev.de/'
                          target='blank'
                          className='hover:underline text-blue-400'
                      >
                          fb-dev.de
                      </Link>
                  </p>
              </footer>
          </div>
      </>
  )
}
